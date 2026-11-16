"use client";
import { useState, useRef, useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { latestProjectAccess } from "@/lib/query/project-access";
import { useWorkspace } from "@/stores/workspace";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { AiConversation } from "@/lib/ai-context";
type Project = { id: string; name: string };
export function AiProjectPicker({
  createRoom = false,
  disabled = false,
}: {
  createRoom?: boolean;
  disabled?: boolean;
}) {
  const { aiContext, aiProject, aiConversation, user } = useWorkspace();
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const query = useInfiniteQuery({
    queryKey: [...matrixKeys.scope(scope), "ai", "projects", q],
    queryFn: ({ signal, pageParam }) =>
      requestJson<{ projects: Project[]; nextCursor: string | null }>(
        `/api/ai/projects?${new URLSearchParams({ q, ...(pageParam ? { cursor: pageParam } : {}) })}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (p) => p.nextCursor,
    ...policy,
    enabled: !aiContext.projectId,
  });
  const command = useWorkspaceMutation({
    mutationFn: async (project: Project) => {
      await latestProjectAccess(client, scope, project.id);
      return createRoom
        ? requestJson<{ conversation: AiConversation }>(
            "/api/ai/conversations",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId: project.id,
                targetPage: "project-analysis",
                sourceContext: {
                  pathname: aiContext.pathname,
                  tab: aiContext.tab,
                },
              }),
            },
          )
        : null;
    },
    retry: false,
    onSuccess: (data, project) => {
      const state = useWorkspace.getState();
      if (
        !active.current ||
        state.user?.id !== scope.userId ||
        state.user?.workspaceId !== scope.workspaceId ||
        state.aiContext.pathname !== aiContext.pathname
      )
        return;
      const transfer = aiConversation?.convId.startsWith("draft-")
        ? state.aiDrafts[aiConversation.convId]
        : undefined;
      state.setAiProject(project);
      if (data) {
        if (transfer)
          state.saveAiDraft(
            data.conversation.convId,
            transfer,
            `${scope.userId}:${scope.workspaceId}`,
          );
        state.selectAiConversation(data.conversation);
        state.refreshAiConversations();
      }
    },
  });
  if (aiContext.projectId) return null;
  const projects = query.data?.pages.flatMap((p) => p.projects) ?? [];
  const selected = aiConversation?.projectId || aiProject.id;
  return (
    <div className="matrix-ai-project-picker">
      <label>
        프로젝트 검색
        <input
          value={q}
          disabled={disabled || command.isPending}
          onChange={(e) => setQ(e.target.value)}
          placeholder="프로젝트 이름 검색"
        />
      </label>
      <label>
        분석 프로젝트
        <select
          aria-label="분석 프로젝트"
          value={selected}
          disabled={disabled || command.isPending}
          onChange={(e) => {
            const project = projects.find((p) => p.id === e.target.value);
            if (project)
              void command.mutateAsync(project).catch(() => undefined);
            else useWorkspace.getState().setAiProject({ id: "", name: "" });
          }}
        >
          <option value="">프로젝트를 선택하세요</option>
          {selected && !projects.some((p) => p.id === selected) && (
            <option value={selected}>
              {aiProject.name || "선택 프로젝트"}
            </option>
          )}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetching}
        >
          더 불러오기
        </button>
      )}
      {query.isFetching && <p role="status">프로젝트를 불러오는 중입니다.</p>}
      {!query.isFetching && !query.error && !projects.length && (
        <p>
          선택할 프로젝트가 없습니다. 프로젝트 생성 또는 배정을 확인해 주세요.
        </p>
      )}
      {Boolean(query.error || command.error) && (
        <p role="alert">
          {resolveWorkspaceError(
            query.error || command.error,
            settings.errorMessages,
          )}
          <button type="button" onClick={() => void query.refetch()}>
            다시 확인
          </button>
        </p>
      )}
      {!user && <p>로그인이 필요합니다.</p>}
    </div>
  );
}
