"use client";
import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@/lib/types";
import type { Project } from "@/lib/project-types";
import type { ProjectData } from "@/lib/artifact-types";
import { useWorkspace } from "@/stores/workspace";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
export function useProjectData(user: User, initialProjectId?: string) {
  const { policy, settings } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const scope = { userId: user.id, workspaceId: user.workspaceId };
  const client = useQueryClient();
  const aiDataVersion = useWorkspace((s) => s.aiDataVersion);
  const [selection, setSelection] = useState({
    scope: `${user.id}:${user.workspaceId}`,
    id: initialProjectId ?? "",
  });
  const [notice, setNotice] = useState("");
  const projectsQuery = useQuery({
    queryKey: matrixKeys.projects(scope),
    queryFn: ({ signal }) =>
      requestJson<{ projects: Project[] }>("/api/projects", { signal }),
    ...policy,
  });
  const projects = projectsQuery.data?.projects ?? [];
  const projectId =
    initialProjectId ??
    (selection.scope === `${user.id}:${user.workspaceId}` ? selection.id : "");
  const setProjectId = useCallback(
    (action: SetStateAction<string>) =>
      setSelection((current) => ({
        scope: `${user.id}:${user.workspaceId}`,
        id: typeof action === "function" ? action(current.id) : action,
      })),
    [user.id, user.workspaceId],
  );
  useEffect(() => {
    if (initialProjectId || !projectsQuery.data || projectId) return;
    let stored = "";
    try {
      stored =
        sessionStorage.getItem(
          `matrix-project:${user.workspaceId}:${user.id}`,
        ) ?? "";
    } catch {}
    const selected = projectsQuery.data.projects.some((p) => p.id === stored)
      ? stored
      : (projectsQuery.data.projects[0]?.id ?? "");
    const timer = window.setTimeout(() => setProjectId(selected), 0);
    return () => window.clearTimeout(timer);
  }, [
    initialProjectId,
    projectsQuery.data,
    projectId,
    user.id,
    user.workspaceId,
    setProjectId,
  ]);
  const dataKey = matrixKeys.artifacts(scope, projectId);
  const artifactsQuery = useQuery({
    queryKey: dataKey,
    queryFn: ({ signal }) =>
      requestJson<ProjectData>(
        `/api/projects/${encodeURIComponent(projectId)}/artifacts`,
        { signal },
      ),
    ...policy,
    enabled: Boolean(projectId),
  });
  useEffect(() => {
    if (projectId) {
      try {
        sessionStorage.setItem(
          `matrix-project:${user.workspaceId}:${user.id}`,
          projectId,
        );
      } catch {}
    }
  }, [projectId, user.workspaceId, user.id]);
  useEffect(() => {
    if (!aiDataVersion) return;
    void client.invalidateQueries({
      queryKey: matrixKeys.dashboards({
        userId: user.id,
        workspaceId: user.workspaceId,
      }),
    });
    void client.invalidateQueries({
      queryKey: matrixKeys.projects({
        userId: user.id,
        workspaceId: user.workspaceId,
      }),
    });
    if (projectId)
      void client.invalidateQueries({
        queryKey: matrixKeys.artifacts(
          { userId: user.id, workspaceId: user.workspaceId },
          projectId,
        ),
      });
  }, [client, aiDataVersion, user.id, user.workspaceId, projectId]);
  const updateData = useCallback(
    (action: SetStateAction<ProjectData | null>) => {
      const key = matrixKeys.artifacts(
        { userId: user.id, workspaceId: user.workspaceId },
        projectId,
      );
      client.setQueryData<ProjectData | null>(key, (current) =>
        typeof action === "function" ? action(current ?? null) : action,
      );
    },
    [client, user.id, user.workspaceId, projectId],
  );
  return {
    updateData,
    projects,
    projectId,
    setProjectId,
    data: artifactsQuery.data ?? null,
    loading: projectsQuery.isLoading || artifactsQuery.isLoading,
    error: resolveWorkspaceError(
      projectsQuery.error ?? artifactsQuery.error,
      settings.errorMessages,
    ),
    notice,
    setNotice,
    reload: () => {
      void projectsQuery.refetch();
      if (projectId) void artifactsQuery.refetch();
    },
  };
}
