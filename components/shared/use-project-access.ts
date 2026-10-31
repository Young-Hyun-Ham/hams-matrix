'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@/lib/types';
import type { ProjectTab } from '@/lib/project-tabs';
import type { ProjectRole } from '@/lib/plan-types';
import type { PermissionAction, ProjectPermissions } from '@/lib/project-permission-model';
import { jsonRequest } from '@/lib/client-request';
import { projectAccessEvent } from '@/lib/project-access-events';

type Access = { projectId: string; userId: string; workspaceId: string; projectRole: ProjectRole; ownerId: string; permissionVersion: number; permissionsByTab: ProjectPermissions };
export function useProjectAccess(user: User, projectId: string, tab: ProjectTab) {
  const scope = `${user.id}:${user.workspaceId}:${projectId}`;
  const [snapshot, setSnapshot] = useState<{ scope: string; access: Access | null; error: string } | null>(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);
  const refresh = useCallback(async () => {
    const sequence = ++generation.current;
    try {
      const access: Access = await jsonRequest(`/api/projects/${projectId}/access`);
      if (sequence !== generation.current) return null;
      if (access.userId !== user.id || access.workspaceId !== user.workspaceId || access.projectId !== projectId)
        throw new Error('로그인 정보가 변경되었습니다. 새로고침해 주세요.');
      setSnapshot({ scope, access, error: '' });
      return access;
    } catch (error) {
      if (sequence === generation.current) setSnapshot({ scope, access: null, error: error instanceof Error ? error.message : '프로젝트 권한을 확인하지 못했습니다.' });
      return null;
    }
  }, [projectId, user.id, user.workspaceId, scope]);
  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onChange = () => { setSnapshot(null); void refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === projectAccessEvent) onChange(); };
    const timer = window.setInterval(onFocus, 10000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener(projectAccessEvent, onChange);
    window.addEventListener('storage', onStorage);
    return () => { invalidate(); clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); window.removeEventListener(projectAccessEvent, onChange); window.removeEventListener('storage', onStorage); };
  }, [refresh, tab, invalidate]);
  const access = snapshot?.scope === scope ? snapshot.access : null;
  const can = useCallback((target: ProjectTab, action: PermissionAction) => access?.permissionsByTab[target]?.[action] === true, [access]);
  const verifyPermission = useCallback(async (target: ProjectTab, action: PermissionAction) => {
    const latest = await refresh();
    return latest?.permissionsByTab[target]?.[action] === true;
  }, [refresh]);
  return { access, can, verifyPermission, error: snapshot?.scope === scope ? snapshot.error : '' };
}
