import { requireUser,checkOrigin,body,errorResponse,HttpError } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireProjectOwner } from '@/lib/team-permissions';
import { initializeProjectPolicy,readProjectPolicy,validateRolePolicy } from '@/lib/project-permissions';
import { permissionTabs,projectRoles } from '@/lib/project-permission-model';
import { audit } from '@/lib/audit';
type Context={params:Promise<{projectId:string}>};
const headers={'Cache-Control':'private, no-store'};
export async function GET(_request:Request,context:Context) {
  try {const user=await requireUser(),{projectId}=await context.params;await requireProjectOwner(db(),user,projectId);return Response.json(await readProjectPolicy(db(),user.workspaceId,projectId),{headers});} catch(e){return errorResponse(e);}
}
export async function PATCH(request:Request,context:Context) {
  try {
    checkOrigin(request);const user=await requireUser(),{projectId}=await context.params,input=await body(request);
    const permissions=validateRolePolicy(input.permissions);
    if(!Number.isSafeInteger(input.expectedVersion)) throw new HttpError(400,'최신 권한 버전이 필요합니다.');
    const tx=await db().transaction('write');
    try {
      await requireProjectOwner(tx,user,projectId);
      await initializeProjectPolicy(tx,user.workspaceId,projectId,user.id);
      const before=await readProjectPolicy(tx,user.workspaceId,projectId);
      if(before.version!==input.expectedVersion) throw new HttpError(409,'권한 설정이 변경되었습니다. 다시 조회해 주세요.');
      for(const role of projectRoles) for(const tab of permissionTabs) {const p=permissions[role][tab];await tx.execute({sql:'UPDATE project_role_tab_permissions SET can_create=?,can_update=?,can_delete=? WHERE project_id=? AND workspace_id=? AND role=? AND tab_key=?',args:[+p.CREATE,+p.UPDATE,+p.DELETE,projectId,user.workspaceId,role,tab]});}
      await tx.execute({sql:'UPDATE project_permission_policies SET version=version+1,updated_by=?,updated_at=? WHERE project_id=? AND workspace_id=?',args:[user.id,new Date().toISOString(),projectId,user.workspaceId]});
      await audit(request,{user,action:'UPDATE',resource:'project_permissions',resourceId:projectId,before:{permissions:before.permissions},after:{permissions},metadata:{projectId}},tx);
      const result=await readProjectPolicy(tx,user.workspaceId,projectId);await tx.commit();return Response.json(result,{headers});
    }catch(e){await tx.rollback();throw e;}finally{tx.close();}
  }catch(e){return errorResponse(e);}
}
