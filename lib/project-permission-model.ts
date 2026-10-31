import { projectTabLabels, type ProjectTab } from './project-tabs';
import type { ProjectRole } from './plan-types';
export const permissionActions = ['CREATE', 'READ', 'UPDATE', 'DELETE'] as const;
export type PermissionAction = typeof permissionActions[number];
export type TabPermissions = Record<PermissionAction, boolean>;
export type ProjectPermissions = Record<ProjectTab, TabPermissions>;
export type RolePermissions = Record<ProjectRole, ProjectPermissions>;
export const projectRoles: ProjectRole[] = ['owner', 'admin', 'member', 'viewer'];
export const permissionTabs = Object.keys(projectTabLabels) as ProjectTab[];
const editable = new Set<ProjectTab>(['rfp','wbs','architecture','requirement','screen','database','program','test','documents']);
export function defaultPermissions(role: ProjectRole): ProjectPermissions {
  return Object.fromEntries(permissionTabs.map(tab => {
    const write = editable.has(tab) && role !== 'viewer' &&
      (role === 'owner' || (tab !== 'rfp' && (role === 'admin' || !['wbs','architecture'].includes(tab))));
    return [tab, { CREATE: write, READ: true, UPDATE: write, DELETE: write }];
  })) as ProjectPermissions;
}
export function defaultRolePermissions(): RolePermissions {
  return Object.fromEntries(projectRoles.map(role => [role, defaultPermissions(role)])) as RolePermissions;
}
