'use client';
import { useEffect,useRef,useState } from 'react';
import { useProjectPage } from '@/components/shared/project-page-context';
import { useRfpDrafts } from '@/stores/rfp-drafts';
import { useWorkspace } from '@/stores/workspace';
import { createEmptyRfp } from '@/lib/rfp-template';
import { jsonRequest } from '@/lib/client-request';
import type { TabPermissions } from '@/lib/project-permission-model';
export function useRfpDocument(){
  const {user,data,can,verifyPermission,onDirtyChange}=useProjectPage();
  const [serverPermissions,setServerPermissions]=useState<TabPermissions|null>(null);
  const key=`${user.workspaceId}:${user.id}:${data.project.id}`;
  const local=useRfpDrafts(s=>s.drafts[key]),document=useRfpDrafts(s=>s.documents[key]);
  const put=useRfpDrafts(s=>s.put),remove=useRfpDrafts(s=>s.remove),setDocument=useRfpDrafts(s=>s.setDocument);
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const aiVersion=useWorkspace(s=>s.aiDataVersion);
  const draft=local??document?.draft??createEmptyRfp(data.project.id,data.project.name);
  const dirty=!!local&&JSON.stringify(local)!==JSON.stringify(document?.draft??createEmptyRfp(data.project.id,data.project.name));
  const dirtyRef=useRef(dirty);useEffect(()=>{dirtyRef.current=dirty;},[dirty]);
  useEffect(()=>{onDirtyChange?.(dirty);const leave=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',leave);return ()=>{onDirtyChange?.(false);window.removeEventListener('beforeunload',leave);};},[dirty,onDirtyChange]);
  useEffect(()=>{
    const controller=new AbortController();
    jsonRequest(`/api/projects/${data.project.id}/rfp`,{signal:controller.signal}).then(result=>{
      if(controller.signal.aborted)return;
      setServerPermissions(result.permissions);
      if(dirtyRef.current){setMessage('미저장 편집본을 보존했습니다. 서버 변경 여부를 확인하려면 조회를 누르세요.');}
      else {setDocument(key,result.document);remove(key);}
      setLoaded(true);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[data.project.id,data.projectRole,data.permissionVersion,key,aiVersion,revision,setDocument,remove]);
  async function save(){
    if(busy||!loaded||!can('rfp',document?'UPDATE':'CREATE'))return;setBusy(true);setError('');
    try{if(!await verifyPermission('rfp',document?'UPDATE':'CREATE'))throw new Error('현재 프로젝트 권한으로 사업계획서/제안요청서를 저장할 수 없습니다.');const result=await jsonRequest(`/api/projects/${data.project.id}/rfp`,{method:document?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:document?.id,expectedVersion:document?.version,draft})});setDocument(key,result.document);remove(key);setMessage('제안요청서를 DB에 저장했습니다.');}catch(e){setError(e instanceof Error?e.message:'저장하지 못했습니다.');}finally{setBusy(false);}
  }
  async function deleteDocument(){
    if(!document||busy||!can('rfp','DELETE')||!window.confirm('저장된 제안요청서를 삭제할까요? 변경 이력은 보존됩니다.'))return;
    setBusy(true);setError('');try{if(!await verifyPermission('rfp','DELETE'))throw new Error('현재 프로젝트 권한으로 삭제할 수 없습니다.');await jsonRequest(`/api/projects/${data.project.id}/rfp`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:document.id,expectedVersion:document.version})});setDocument(key,null);remove(key);setMessage('제안요청서를 삭제했습니다.');}catch(e){setError(e instanceof Error?e.message:'삭제하지 못했습니다.');}finally{setBusy(false);}
  }
  function reload(){if(busy||(dirty&&!window.confirm('미저장 편집본을 버리고 최신 저장본을 조회할까요?')))return;dirtyRef.current=false;remove(key);setError('');setRevision(v=>v+1);}
  const writable=can('rfp',document?'UPDATE':'CREATE')&&serverPermissions?.[document?'UPDATE':'CREATE']===true;
  return {draft,document,dirty,busy,loaded,message:writable?message:'',error,canWrite:loaded&&!busy&&writable,canDelete:can('rfp','DELETE')&&serverPermissions?.DELETE===true,update:(value:typeof draft)=>{if(loaded&&!busy&&writable)put(key,value);},save,deleteDocument,reload};
}
