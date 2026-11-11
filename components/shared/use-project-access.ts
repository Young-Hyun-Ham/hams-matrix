"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@/lib/types";
import type { ProjectTab } from "@/lib/project-tabs";
import type { PermissionAction } from "@/lib/project-permission-model";
import { projectAccessEvent } from "@/lib/project-access-events";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  projectAccessQuery,
  latestProjectAccess,
  type ProjectAccess as Access,
} from "@/lib/query/project-access";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
export function useProjectAccess(
  user: User,
  projectId: string,
  tab: ProjectTab,
) {
  const scope = `${user.id}:${user.workspaceId}:${projectId}`;
  const client = useQueryClient();
  const { settings } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const query = useQuery({
    ...projectAccessQuery(
      { userId: user.id, workspaceId: user.workspaceId },
      projectId,
    ),
    enabled: Boolean(projectId),
  });
  const [snapshot, setSnapshot] = useState<{
    scope: string;
    access: Access | null;
    error: string;
  } | null>(null);
  const generation = useRef(0);
  const invalidate = useCallback(() => {
    ++generation.current;
  }, []);
  const refresh = useCallback(async () => {
    const sequence = ++generation.current;
    try {
      const access = await latestProjectAccess(
        client,
        { userId: user.id, workspaceId: user.workspaceId },
        projectId,
      );
      if (sequence !== generation.current) return null;
      if (
        access.userId !== user.id ||
        access.workspaceId !== user.workspaceId ||
        access.projectId !== projectId
      )
        throw new Error("로그인 정보가 변경되었습니다. 새로고침해 주세요.");
      setSnapshot({ scope, access, error: "" });
      return access;
    } catch (error) {
      if (sequence === generation.current)
        setSnapshot({
          scope,
          access: null,
          error: resolveWorkspaceError(error, settings.errorMessages),
        });
      return null;
    }
  }, [
    client,
    projectId,
    user.id,
    user.workspaceId,
    scope,
    settings.errorMessages,
  ]);
  useEffect(() => {
    const onChange = () => {
      setSnapshot(null);
      void refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === projectAccessEvent) onChange();
    };
    window.addEventListener(projectAccessEvent, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      invalidate();
      window.removeEventListener(projectAccessEvent, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh, tab, invalidate]);
  const candidate = query.data;
  const access =
    query.isError ||
    query.isFetching ||
    !candidate ||
    candidate.userId !== user.id ||
    candidate.workspaceId !== user.workspaceId ||
    candidate.projectId !== projectId
      ? null
      : candidate;
  const can = useCallback(
    (target: ProjectTab, action: PermissionAction) =>
      access?.permissionsByTab[target]?.[action] === true,
    [access],
  );
  const verifyPermission = useCallback(
    async (target: ProjectTab, action: PermissionAction) => {
      const latest = await refresh();
      return latest?.permissionsByTab[target]?.[action] === true;
    },
    [refresh],
  );
  return {
    access,
    can,
    verifyPermission,
    error:
      resolveWorkspaceError(query.error, settings.errorMessages) ||
      (snapshot?.scope === scope ? snapshot.error : ""),
  };
}
