import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Client, Transaction, Row } from '@libsql/client';
import { db } from './db';
import { HttpError } from './auth';
import type { User } from './types';
import type { RfpDocument, RfpDraft } from './rfp-types';
import { createRfpSample, createEmptyRfp, RFP_CATEGORIES } from './rfp-template';
import { requireProjectPermission } from './project-permissions';
import { audit } from './audit';
type Executor=Pick<Client,'execute'>;
export function emptyRfp(projectId:string,title=''):RfpDraft {
  return createEmptyRfp(projectId,title);
}
function object(value:unknown):Record<string,unknown> {if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'문서 구조를 확인해 주세요.');return value as Record<string,unknown>;}
export function validateRfp(value:unknown,projectId:string):RfpDraft {
  const root=object(value);
  if(root.schemaVersion!==1||root.projectId!==projectId||JSON.stringify(root).length>300000)throw new HttpError(400,'문서 버전·프로젝트·크기를 확인해 주세요.');
  const sample=createRfpSample(projectId,'');
  sample.evaluation=[{id:'',criterion:'',description:'',points:''}];
  function check(input:unknown,template:unknown,path:string):unknown {
    if(typeof template==='string'){if(typeof input!=='string'||input.length>(path==='title'?200:10000))throw new HttpError(400,`${path} 문자열 길이를 확인해 주세요.`);return input;}
    if(Array.isArray(template)){
      if(!Array.isArray(input)||input.length>200)throw new HttpError(400,`${path} 목록은 최대 200건입니다.`);
      const ids=new Set<string>();return input.map(item=>{const row=check(item,template[0],path) as Record<string,string>;if(!row.id||row.id.length>100||ids.has(row.id))throw new HttpError(400,'문서 항목 ID가 중복되거나 잘못되었습니다.');ids.add(row.id);return row;});
    }
    if(template&&typeof template==='object'){
      const row=object(input),shape=template as Record<string,unknown>;
      if(Object.keys(row).some(k=>!Object.hasOwn(shape,k)))throw new HttpError(400,`${path}에 허용되지 않은 필드가 있습니다.`);
      return Object.fromEntries(Object.entries(shape).map(([k,t])=>[k,check(row[k],t,path?`${path}.${k}`:k)]));
    }
    if(input!==template)throw new HttpError(400,'문서 스키마를 확인해 주세요.');return input;
  }
  const draft=check(root,sample,'') as RfpDraft;
  for(const value of [draft.basic.startDate,draft.basic.endDate,draft.proposalGuide.deadline]) if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new HttpError(400,'날짜 형식을 확인해 주세요.');
  if(draft.basic.startDate&&draft.basic.endDate&&draft.basic.startDate>draft.basic.endDate)throw new HttpError(400,'사업 종료일은 시작일 이후여야 합니다.');
  if(draft.basic.budget&&(!Number.isFinite(Number(draft.basic.budget))||Number(draft.basic.budget)<0))throw new HttpError(400,'예산을 확인해 주세요.');
  for(const r of draft.requirements)if(!RFP_CATEGORIES.some(c=>c.code===r.category))throw new HttpError(400,'요구사항 분류를 확인해 주세요.');
  for(const r of draft.evaluation)if(r.points&&(!Number.isFinite(Number(r.points))||Number(r.points)<0))throw new HttpError(400,'배점을 확인해 주세요.');
  return draft;
}
function toDocument(row:Row):RfpDocument{return {id:String(row.id),version:Number(row.version),draft:JSON.parse(String(row.document_json)),createdAt:String(row.created_at),updatedAt:String(row.updated_at),updatedBy:String(row.updated_by)};}
export async function readRfp(executor:Executor,user:User,projectId:string){
  const access=await requireProjectPermission(executor,user,projectId,'rfp','READ');
  const row=(await executor.execute({sql:'SELECT * FROM project_rfp_documents WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL',args:[projectId,user.workspaceId]})).rows[0];
  return {document:row?toDocument(row):null,permissions:access.permissionsByTab.rfp};
}
export async function mutateRfp(request:Request,user:User,projectId:string,input:Record<string,unknown>,action:'CREATE'|'UPDATE'|'DELETE',transaction?:Transaction):Promise<RfpDocument> {
  const tx=transaction??await db().transaction('write');
  try {
    await requireProjectPermission(tx,user,projectId,'rfp',action);
    if(Object.keys(input).some(k=>!['action','id','expectedVersion','draft','patch'].includes(k)))throw new HttpError(400,'허용되지 않은 문서 입력입니다.');
    if(action==='CREATE'&&(input.id!==undefined||input.expectedVersion!==undefined))throw new HttpError(400,'신규 문서 ID와 버전은 서버가 발급합니다.');
    const before=(await readRfp(tx,user,projectId)).document;
    if(action==='CREATE'&&before)throw new HttpError(409,'이미 저장된 제안요청서가 있습니다. 최신 문서를 조회해 주세요.');
    if(action!=='CREATE'&&(!before||input.id!==before.id||input.expectedVersion!==before.version))throw new HttpError(409,'문서가 변경되었거나 삭제되었습니다. 최신 내용을 조회해 주세요.');
    const now=new Date().toISOString();
    let draft=before?.draft??emptyRfp(projectId);
    if(action!=='DELETE') {
      if(input.draft!==undefined&&input.patch!==undefined)throw new HttpError(400,'전체 문서와 부분 변경을 동시에 지정할 수 없습니다.');
      if(input.patch!==undefined){
        const patch=object(input.patch);
        if(Object.keys(patch).some(k=>!Object.hasOwn(draft,k)||['projectId','schemaVersion'].includes(k)))throw new HttpError(400,'변경할 장을 확인해 주세요.');
        const merged={...draft} as Record<string,unknown>;
        for(const [key,value] of Object.entries(patch)) merged[key]=value&&typeof value==='object'&&!Array.isArray(value)?{...object(merged[key]),...object(value)}:value;
        draft=validateRfp(merged,projectId);
      }else draft=validateRfp(input.draft,projectId);
    }
    const after:RfpDocument={id:before?.id??randomUUID(),version:(before?.version??0)+1,draft,createdAt:before?.createdAt??now,updatedAt:now,updatedBy:user.id};
    if(!before)await tx.execute({sql:'INSERT INTO project_rfp_documents(id,project_id,workspace_id,document_json,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',args:[after.id,projectId,user.workspaceId,JSON.stringify(draft),user.id,user.id,now,now]});
    else await tx.execute({sql:'UPDATE project_rfp_documents SET document_json=?,version=?,updated_by=?,updated_at=?,deleted_at=? WHERE id=? AND project_id=? AND workspace_id=?',args:[JSON.stringify(draft),after.version,user.id,now,action==='DELETE'?now:null,after.id,projectId,user.workspaceId]});
    await tx.execute({sql:'INSERT INTO project_rfp_revisions(id,document_id,project_id,workspace_id,document_version,action,actor_id,actor_name,snapshot_json,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)',args:[randomUUID(),after.id,projectId,user.workspaceId,after.version,action,user.id,user.name,JSON.stringify(after),now]});
    await audit(request,{user,action,resource:'rfp',resourceId:after.id,before:before?{version:before.version}:undefined,after:{version:after.version},metadata:{projectId}},tx);
    if(!transaction)await tx.commit();return after;
  }catch(e){if(!transaction)await tx.rollback();throw e;}finally{if(!transaction)tx.close();}
}
