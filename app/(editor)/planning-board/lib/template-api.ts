"use client";
import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { jsonRequest } from "@/lib/client-request";
import { planningFetch } from "./client-api";
import { builtinTemplates, type TemplateSummary } from "../types/templates";
export function templateRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return requestJson<T>(path, init, (url, options) =>
    planningFetch(url, options, "operation"),
  );
}
export function useTemplateRequest() {
  const { scope, policy } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const command = useMutation({
    mutationFn: ({ path, init }: { path: string; init?: RequestInit }) =>
      templateRequest<Awaited<ReturnType<typeof jsonRequest>>>(path, init),
    retry: false,
  });
  const { mutateAsync } = command;
  return useCallback(
    async <T>(path: string, init?: RequestInit): Promise<T> => {
      if ((init?.method ?? "GET").toUpperCase() === "GET")
        return client.query({
          queryKey: [...matrixKeys.scope(scope), "planning", "template", path],
          queryFn: ({ signal }) =>
            templateRequest<T>(path, { ...init, signal }),
          ...policy,
        });
      const result = await mutateAsync({ path, init });
      await client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "planning"],
        refetchType: "none",
      });
      return result as T;
    },
    [client, scope, policy, mutateAsync],
  );
}
export function useProjectTemplates() {
  const projectId = useSearchParams().get("projectId") ?? "";
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const query = useQuery({
    queryKey: [...matrixKeys.scope(scope), "planning", projectId, "templates"],
    queryFn: ({ signal }) =>
      templateRequest<{ templates: TemplateSummary[] }>(
        `/api/planning/projects/${encodeURIComponent(projectId)}/templates`,
        { signal },
      ),
    ...policy,
    enabled: Boolean(projectId && scope.workspaceId),
    refetchOnWindowFocus: "always",
  });
  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);
  const channelName = `matrix-planning-templates:${scope.workspaceId}:${projectId}`;
  useEffect(() => {
    if (!projectId || !scope.workspaceId) return;
    const channel = new BroadcastChannel(channelName);
    const reload = () => {
      void refresh();
    };
    channel.addEventListener("message", reload);
    return () => channel.close();
  }, [projectId, scope.workspaceId, channelName, refresh]);
  const notify = () => {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "templates-changed" });
    channel.close();
    void refresh();
  };
  return {
    projectId,
    templates: query.data?.templates ?? builtinTemplates,
    error: resolveWorkspaceError(query.error, settings.errorMessages),
    refresh,
    notify,
  };
}
