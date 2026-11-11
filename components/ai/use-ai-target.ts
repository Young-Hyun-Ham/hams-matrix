"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AiContext, AiConversation } from "@/lib/ai-context";
import type { User } from "@/lib/types";
import {
  aiTargetPages,
  targetFromLocation,
  type AiTargetPage,
} from "@/lib/ai-target-pages";
import { useWorkspace } from "@/stores/workspace";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import {
  projectAccessQuery,
  latestProjectAccess,
} from "@/lib/query/project-access";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
export function useAiTarget(
  conversation: AiConversation,
  source: AiContext,
  user: User | null,
  metadataReady: boolean,
  open: boolean,
) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useWorkspaceErrorState("");
  const [retry, setRetry] = useState(0);
  const { scope, settings } = useWorkspaceQueryPolicy(
    user ? { userId: user.id, workspaceId: user.workspaceId } : undefined,
  );
  const { convId, projectId, targetPage, targetVersion = 0 } = conversation;
  const temporary = convId.startsWith("temporary-");
  const initialTarget = targetFromLocation(
    projectId,
    source.pathname,
    source.tab,
  );
  const client = useQueryClient();
  const identity = `${scope.userId}:${scope.workspaceId}:${projectId}:${convId}`;
  const activeIdentity = useRef<string | null>(identity);
  useLayoutEffect(() => {
    activeIdentity.current = identity;
    return () => {
      activeIdentity.current = null;
    };
  }, [identity]);
  const accessQuery = useQuery({
    ...projectAccessQuery(scope, projectId),
    enabled: open && Boolean(projectId && user),
  });
  const verifyTarget = useCallback(
    async (target: AiTargetPage | null | undefined, signal?: AbortSignal) => {
      signal?.throwIfAborted();
      if (!user || !target)
        throw new RequestError(403, "AI_TARGET_ACCESS_DENIED");
      if (projectId) {
        const latest = await latestProjectAccess(client, scope, projectId);
        signal?.throwIfAborted();
        if (activeIdentity.current !== identity)
          throw new DOMException("AI target changed", "AbortError");
        if (
          target === "dashboard" ||
          target === "team" ||
          !latest.permissionsByTab[target]?.READ
        )
          throw new RequestError(403, "AI_TARGET_ACCESS_DENIED");
      } else {
        const latest = await client.query({
          queryKey: matrixKeys.me(scope),
          queryFn: ({ signal }) =>
            requestJson<{ user: User }>("/api/me", { signal }),
          staleTime: 0,
          retry: false,
        });
        signal?.throwIfAborted();
        if (activeIdentity.current !== identity)
          throw new DOMException("AI target changed", "AbortError");
        if (
          latest.user.id !== scope.userId ||
          latest.user.workspaceId !== scope.workspaceId ||
          (target !== "dashboard" && target !== "team") ||
          (target === "team" && !latest.user.teamSharingEnabled)
        )
          throw new RequestError(403, "AI_TARGET_ACCESS_DENIED");
      }
    },
    [client, scope, projectId, user, identity],
  );
  const checked = accessQuery.data;
  const access =
    !accessQuery.isError &&
    !accessQuery.isFetching &&
    checked?.userId === user?.id &&
    checked?.workspaceId === user?.workspaceId &&
    checked?.projectId === projectId
      ? (checked?.permissionsByTab ?? null)
      : null;
  const accessError = resolveWorkspaceError(
    accessQuery.error,
    settings.errorMessages,
  );
  const command = useMutation({
    mutationFn: async ({
      input,
      signal,
      acceptConflict = false,
    }: {
      input: object;
      signal?: AbortSignal;
      acceptConflict?: boolean;
    }) => {
      await verifyTarget(
        (input as { targetPage: AiTargetPage }).targetPage,
        signal,
      );
      let response: { conversation: AiConversation };
      try {
        response = await requestJson(
          `/api/ai/conversations/${encodeURIComponent(convId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify(input),
          },
        );
      } catch (error) {
        const payload =
          error instanceof RequestError
            ? (error.payload as { conversation?: AiConversation } | undefined)
            : undefined;
        if (
          payload?.conversation &&
          useWorkspace.getState().user?.id === scope.userId &&
          useWorkspace.getState().user?.workspaceId === scope.workspaceId
        )
          useWorkspace.getState().updateAiConversation(payload.conversation);
        if (
          acceptConflict &&
          error instanceof RequestError &&
          error.status === 409 &&
          payload?.conversation?.targetPage
        )
          return payload as { conversation: AiConversation };
        throw error;
      }
      if (
        useWorkspace.getState().user?.id === scope.userId &&
        useWorkspace.getState().user?.workspaceId === scope.workspaceId
      )
        useWorkspace.getState().updateAiConversation(response.conversation);
      return response;
    },
    retry: false,
  });
  const { mutateAsync } = command;

  useEffect(() => {
    if (
      !open ||
      !metadataReady ||
      targetPage ||
      !initialTarget ||
      source.projectId !== projectId
    )
      return;
    const controller = new AbortController();
    if (temporary) {
      useWorkspace.getState().updateAiConversation({
        ...conversation,
        targetPage: initialTarget,
        targetVersion: 1,
      });
      return;
    }
    void mutateAsync({
      input: {
        projectId,
        targetPage: initialTarget,
        expectedTargetVersion: targetVersion,
      },
      signal: controller.signal,
      acceptConflict: true,
    })
      .then(() => {
        if (!controller.signal.aborted) setError("");
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof RequestError
              ? reason
              : reason instanceof Error
                ? reason.message
                : "AI 대상을 초기화하지 못했습니다.",
          );
      });
    return () => controller.abort();
    // Only the initial location is used until the server accepts the first target.
  }, [
    mutateAsync,
    open,
    metadataReady,
    targetPage,
    initialTarget,
    source.projectId,
    projectId,
    convId,
    targetVersion,
    temporary,
    retry,
    conversation,
    settings.errorMessages,
    setError,
  ]);

  async function change(target: AiTargetPage) {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      if (temporary) {
        await verifyTarget(target);
        useWorkspace
          .getState()
          .updateAiConversation({
            ...conversation,
            targetPage: target,
            targetVersion: targetVersion + 1,
          });
        return;
      }
      await mutateAsync({
        input: {
          projectId,
          targetPage: target,
          expectedTargetVersion: targetVersion,
        },
      });
    } catch (reason) {
      setError(
        reason instanceof RequestError
          ? reason
          : reason instanceof Error
            ? reason.message
            : "AI 대상을 저장하지 못했습니다. 다시 선택해 주세요.",
      );
    } finally {
      setSaving(false);
    }
  }
  const options = aiTargetPages
    .filter((page) => page.project === !!projectId)
    .map((page) => {
      const rights =
        projectId && page.key !== "dashboard" && page.key !== "team"
          ? access?.[page.key]
          : null;
      return {
        ...page,
        allowed: projectId
          ? !!rights?.READ && !accessError
          : page.key !== "team" || user?.teamSharingEnabled === true,
        readOnly: !rights || !(rights.CREATE || rights.UPDATE || rights.DELETE),
      };
    });
  const selected = options.find((page) => page.key === targetPage);
  const initializing =
    metadataReady && !targetPage && !error && !!initialTarget;
  return {
    options,
    saving,
    initializing,
    error,
    accessError,
    change,
    supported: !!selected?.supported,
    ready:
      !!targetPage &&
      !!selected?.supported &&
      !!selected?.allowed &&
      !saving &&
      !initializing &&
      !accessError,
    retry: () => {
      setError("");
      setRetry((value) => value + 1);
    },
    verify: (signal?: AbortSignal) => verifyTarget(targetPage, signal),
    retryAccess: () => {
      void accessQuery.refetch();
    },
  };
}
