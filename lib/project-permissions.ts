import 'server-only';
import type { Client } from '@libsql/client';
import type { User } from './types';
import type { ProjectRole } from './plan-types';
import type { ProjectTab } from './project-tabs';
import { HttpError } from './auth';
import { projectRoleSql } from './team-permissions';
import { defaultPermissions, defaultRolePermissions, permissionTabs, projectRoles, permissionActions, type PermissionAction, type RolePermissions } from './project-permission-model';
type Executor = Pick<Client,'execute'>;
export async function projectPermissionAccess(executor: Executor, user: User, projectId: string) {
  if (user.accountRole==='guest' || !user.onboardingComplete) throw new HttpError(403,'프로젝트 접근 권한이 없습니다.');
  const row=(await executor.execute({sql:`SELECT p.owner_id,${projectRoleSql} AS role FROM projects p JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id JOIN workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id JOIN users u ON u.id=m.user_id WHERE p.id=? AND p.workspace_id=? AND m.user_id=? AND u.account_role!='guest' AND u.onboarding_complete=1`,args:[projectId,user.workspaceId,user.id]})).rows[0];
  if(!row) throw new HttpError(404,'프로젝트를 찾을 수 없습니다.');
  const projectRole=String(row.role) as ProjectRole;
  if(!projectRoles.includes(projectRole)) throw new HttpError(403,'프로젝트 역할을 확인해 주세요.');
  const policy=await readProjectPolicy(executor,user.workspaceId,projectId);
  return {projectRole,ownerId:String(row.owner_id),permissionVersion:policy.version,permissionsByTab:policy.permissions[projectRole]};
}
export async function readProjectPolicy(executor: Executor, workspaceId: string, projectId: string) {
  const permissions=defaultRolePermissions();
  const header=(await executor.execute({sql:'SELECT version FROM project_permission_policies WHERE project_id=? AND workspace_id=?',args:[projectId,workspaceId]})).rows[0];
  // An initialized policy grants only explicitly checked actions. Missing rows cannot restore defaults.
  if(header) for(const role of ['admin','member'] as const) for(const tab of permissionTabs)
    permissions[role][tab]={READ:true,CREATE:false,UPDATE:false,DELETE:false};
  const rows=(await executor.execute({sql:'SELECT * FROM project_role_tab_permissions WHERE project_id=? AND workspace_id=?',args:[projectId,workspaceId]})).rows;
  for(const row of rows) {
    const role=String(row.role) as ProjectRole,tab=String(row.tab_key) as ProjectTab;
    if(!projectRoles.includes(role)||!permissionTabs.includes(tab)||role==='owner'||role==='viewer') continue;
    const ceiling=defaultPermissions(role)[tab];
    permissions[role][tab]={READ:true,CREATE:ceiling.CREATE&&row.can_create===1,UPDATE:ceiling.UPDATE&&row.can_update===1,DELETE:ceiling.DELETE&&row.can_delete===1};
  }
  return {version:Number(header?.version??1),permissions};
}
export async function initializeProjectPolicy(executor: Executor, workspaceId: string, projectId: string, actorId: string) {
  await executor.execute({sql:'INSERT OR IGNORE INTO project_permission_policies(project_id,workspace_id,updated_by) VALUES (?,?,?)',args:[projectId,workspaceId,actorId]});
  const defaults=defaultRolePermissions();
  for(const role of projectRoles) for(const tab of permissionTabs) {
    const p=defaults[role][tab];
    await executor.execute({sql:'INSERT OR IGNORE INTO project_role_tab_permissions(project_id,workspace_id,role,tab_key,can_create,can_read,can_update,can_delete) VALUES (?,?,?,?,?,1,?,?)',args:[projectId,workspaceId,role,tab,+p.CREATE,+p.UPDATE,+p.DELETE]});
  }
}
export async function requireProjectPermission(executor: Executor,user: User,projectId: string,tab: ProjectTab,action: PermissionAction) {
  if(!permissionTabs.includes(tab)||!permissionActions.includes(action)) throw new HttpError(400,'권한 대상을 확인해 주세요.');
  const access=await projectPermissionAccess(executor,user,projectId);
  if(!access.permissionsByTab[tab][action]) throw new HttpError(403,'현재 프로젝트 역할에는 해당 메뉴의 작업 권한이 없습니다.');
  return access;
}
export function validateRolePolicy(input: unknown): RolePermissions {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new HttpError(400,'권한 설정을 확인해 주세요.');
  const value=input as RolePermissions,defaults=defaultRolePermissions();
  if(Object.keys(value).length!==projectRoles.length) throw new HttpError(400,'역할을 모두 지정해 주세요.');
  for(const role of projectRoles) {
    if(!value[role]||Object.keys(value[role]).length!==permissionTabs.length) throw new HttpError(400,'메뉴 권한을 모두 지정해 주세요.');
    for(const tab of permissionTabs) {
      const item=value[role][tab];
      if(!item||Object.keys(item).length!==4) throw new HttpError(400,'CRUD 권한을 확인해 주세요.');
      for(const action of permissionActions) {
        if(typeof item[action]!=='boolean'||(item[action]&&!defaults[role][tab][action])||((role==='owner'||role==='viewer'||action==='READ')&&item[action]!==defaults[role][tab][action])) throw new HttpError(400,'고정 권한을 변경하거나 기본 허용 범위를 확대할 수 없습니다.');
      }
    }
  }
  return value;
}
