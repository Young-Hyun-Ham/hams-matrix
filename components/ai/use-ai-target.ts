"use client";
import { useEffect, useState } from "react";
import type { AiContext, AiConversation } from "@/lib/ai-context";
import type { User } from "@/lib/types";
import type { ProjectPermissions } from "@/lib/project-permission-model";
import {
  aiTargetPages,
  targetFromLocation,
  type AiTargetPage,
} from "@/lib/ai-target-pages";
import { useWorkspace } from "@/stores/workspace";

export function useAiTarget(
  conversation: AiConversation,
  source: AiContext,
  user: User | null,
  metadataReady: boolean,
  open: boolean,
) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [access, setAccess] = useState<ProjectPermissions | null>(null);
  const [accessError, setAccessError] = useState("");
  const [accessRetry, setAccessRetry] = useState(0);
  const { convId, projectId, targetPage, targetVersion = 0 } = conversation;
  const temporary = convId.startsWith("temporary-");
  const initialTarget = targetFromLocation(
    projectId,
    source.pathname,
    source.tab,
  );
  useEffect(() => {
    if (!open || !projectId) return;
    const controller = new AbortController();
    fetch(`/api/projects/${encodeURIComponent(projectId)}/access`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) {
          setAccess(data.permissionsByTab);
          setAccessError("");
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setAccessError(
            reason instanceof Error
              ? reason.message
              : "대상 권한을 확인하지 못했습니다.",
          );
      });
    return () => controller.abort();
  }, [open, projectId, user?.id, user?.workspaceId, accessRetry]);

  useEffect(() => {
    if (
      !metadataReady ||
      targetPage ||
      !initialTarget ||
      source.projectId !== projectId
    )
      return;
    const controller = new AbortController();
    if (temporary) {
      useWorkspace
        .getState()
        .updateAiConversation({
          ...conversation,
          targetPage: initialTarget,
          targetVersion: 1,
        });
      return;
    }
    fetch(`/api/ai/conversations/${encodeURIComponent(convId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        projectId,
        targetPage: initialTarget,
        expectedTargetVersion: targetVersion,
      }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.conversation)
          useWorkspace.getState().updateAiConversation(data.conversation);
        if (
          !response.ok &&
          !(response.status === 409 && data.conversation?.targetPage)
        )
          throw new Error(data.error);
        setError("");
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "AI 대상을 초기화하지 못했습니다.",
          );
      });
    return () => controller.abort();
    // Only the initial location is used until the server accepts the first target.
  }, [
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
  ]);

  async function change(target: AiTargetPage) {
    if (saving) return;
    setError("");
    if (temporary) {
      useWorkspace
        .getState()
        .updateAiConversation({
          ...conversation,
          targetPage: target,
          targetVersion: targetVersion + 1,
        });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/ai/conversations/${encodeURIComponent(convId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            targetPage: target,
            expectedTargetVersion: targetVersion,
          }),
        },
      );
      const data = await response.json();
      if (data.conversation)
        useWorkspace.getState().updateAiConversation(data.conversation);
      if (!response.ok) throw new Error(data.error);
    } catch (reason) {
      setError(
        reason instanceof Error
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
    retryAccess: () => setAccessRetry((value) => value + 1),
  };
}
