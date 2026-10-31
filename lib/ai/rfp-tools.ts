import 'server-only';
import type { Client,Transaction } from '@libsql/client';
import { db } from '../db';
import { HttpError } from '../auth';
import type { User } from '../types';
import type { AiContext } from '../ai-context';
import type { AiAction } from './page-tools';
import type { GuardrailPolicy,GuardrailStage } from './guardrail-types';
import { GenerationCancelled } from './generation-control';
import { GuardrailBlocked } from './guardrails';
import { mutateRfp,readRfp,emptyRfp } from '../rfp-server';
import { requireProjectPermission } from '../project-permissions';
export function createRfpAgent(request:Request,user:User,context:AiContext,canWrite:boolean,prompt:string,checkpoint?: (executor?:Pick<Client,'execute'>)=>Promise<void>,guard?:{policy:GuardrailPolicy;inspect:(stage:GuardrailStage,value:unknown)=>Promise<unknown>}) {
  const actions:AiAction[]=[];
  let pending:{input:Record<string,unknown>;action:'CREATE'|'UPDATE'|'DELETE'}|null=null;
  const tools:Record<string,unknown>[]=[{type:'function',name:'read_page',description:'현재 프로젝트의 실제 제안요청서와 ID/version을 조회합니다.',parameters:{type:'object',properties:{},additionalProperties:false}}];
  if(canWrite) tools.push({type:'function',name:'save_rfp_document',description:`현재 제안요청서를 작성하고 DB 초안으로 저장합니다. CREATE는 draft 전체, UPDATE는 id/expectedVersion과 patch(변경할 장/필드만), DELETE는 id/expectedVersion을 전달합니다. 문서 구조: ${JSON.stringify(emptyRfp(context.projectId))}. requirements는 {id,number,category(SFR 등),title,definition,details,outputs,acceptance}[], delivery.schedule은 {id,phase,period,deliverable}[], evaluation은 {id,criterion,description,points}[]입니다. 목록을 수정할 때 기존 항목과 ID를 보존합니다.`,parameters:{type:'object',properties:{action:{type:'string',enum:['CREATE','UPDATE','DELETE']},id:{type:'string'},expectedVersion:{type:'integer'},draft:{type:'object'},patch:{type:'object'}},required:['action'],additionalProperties:false}});
  async function execute(name:string,input:Record<string,unknown>){
    try {
      await checkpoint?.();await guard?.inspect('tool',{name,input});
      if(name==='read_page'){if(Object.keys(input).length)throw new HttpError(400,'조회 인자는 비워 주세요.');const data=await readRfp(db(),user,context.projectId);await guard?.inspect('tool-result',data);return {success:true,data};}
      if(name!=='save_rfp_document'||!canWrite)throw new HttpError(403,'제안요청서 저장 권한이 없습니다.');
      const action=input.action;
      if(action!=='CREATE'&&action!=='UPDATE'&&action!=='DELETE')throw new HttpError(400,'작업 유형을 확인해 주세요.');
      if(guard&&!guard.policy.allowedActions.includes(action))throw new HttpError(403,'관리자 정책에서 허용하지 않은 작업입니다.');
      if(/(?:저장|등록|추가|수정|변경|삭제|작성).{0,8}(?:하지\s*마|하지\s*말|금지|하지\s*않)|(?:예시|초안|분석|추천)\s*만|저장\s*(?:없이|금지)/.test(prompt))throw new HttpError(403,'텍스트 작성만 요청하여 DB에는 저장하지 않습니다.');
      const intent=action==='CREATE'?/(?:작성|등록|저장|추가)(?:해|하|\s|줘|$)|\bcreate\b|\bsave\b/i:action==='UPDATE'?/(?:수정|변경)(?:해|하|\s|줘|$)|\bupdate\b|\bedit\b/i:/(?:삭제|제거)(?:해|하|\s|줘|$)|\bdelete\b|\bremove\b/i;
      if(!intent.test(prompt))throw new HttpError(403,'해당 변경 작업을 명시적으로 요청해 주세요.');
      if(pending)throw new HttpError(409,'한 요청에는 제안요청서 변경 한 건만 가능합니다.');
      if(Object.keys(input).some(k=>!['action','id','expectedVersion','draft','patch'].includes(k)))throw new HttpError(400,'허용되지 않은 입력입니다.');
      if(action==='UPDATE'&&input.draft!==undefined)throw new HttpError(400,'수정은 patch로 지정한 장만 변경해 주세요.');
      if(action!=='CREATE'){
        const before=(await readRfp(db(),user,context.projectId)).document;
        if(!before || (action==='DELETE' && ![before.id,before.draft.title,'제안요청서','제안서','사업계획서'].filter(Boolean).some(v=>prompt.includes(v))))throw new HttpError(400,'수정/삭제할 제안요청서를 명확히 지정해 주세요.');
      }
      await requireProjectPermission(db(),user,context.projectId,'rfp',action);
      const tx=await db().transaction('write');
      try{await mutateRfp(request,user,context.projectId,input,action,tx);}finally{await tx.rollback();tx.close();}
      pending={input:structuredClone(input),action};
      return {success:true,pending:true,message:'검증한 변경안입니다. 최종 검사 후 DB 초안으로 저장되며 아직 반영되지 않았습니다.'};
    }catch(e){if(e instanceof GenerationCancelled||e instanceof GuardrailBlocked)throw e;return {success:false,status:e instanceof HttpError?e.status:500,error:e instanceof HttpError?e.message:'제안요청서 처리 중 오류가 발생했습니다.'};}
  }
  async function commit(tx:Transaction):Promise<AiAction[]>{
    if(!pending)return [];await checkpoint?.(tx);
    const saved=await mutateRfp(request,user,context.projectId,pending.input,pending.action,tx);
    return [{target:'rfp',action:pending.action,id:saved.id,code:saved.id,title:saved.draft.title,version:saved.version}];
  }
  return {tools,execute,commit,actions,pendingCount:()=>pending?1:0};
}
