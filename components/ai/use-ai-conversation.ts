"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiChat, AiConversation } from "@/lib/ai-context";
import { useWorkspace } from "@/stores/workspace";

export function useAiConversation(conversation: AiConversation, open: boolean) {
  const [chats, setChats] = useState<AiChat[]>([]);
  const [loading, setLoading] = useState(true),
    [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(""),
    [nextCursor, setNextCursor] = useState<string | null>(null);
  const [olderError, setOlderError] = useState("");
  const [loadedVersion, setLoadedVersion] = useState(0);
  const [version, setVersion] = useState(0);
  const olderRequest = useRef<AbortController | null>(null);
  const appended = useRef<AiChat[]>([]);
  const projectId = conversation.projectId,
    convId = conversation.convId;
  const url = `/api/ai/chats?projectId=${encodeURIComponent(projectId)}&convId=${encodeURIComponent(convId)}`;
  useEffect(() => {
    if (!open) return;
    olderRequest.current?.abort();
    olderRequest.current = null;
    const appendStart = appended.current.length;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        const ids = new Set<string>(data.chats.map((chat: AiChat) => chat.id));
        setChats([
          ...data.chats,
          ...appended.current
            .slice(data.historyEnabled === false ? 0 : appendStart)
            .filter((chat) => !ids.has(chat.id)),
        ]);
        setNextCursor(data.nextCursor);
        setError("");
        setOlderError("");
        setLoadingOlder(false);
        setLoadedVersion((value) => value + 1);
        useWorkspace.getState().updateAiConversation(data.conversation);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "대화를 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      olderRequest.current?.abort();
      olderRequest.current = null;
    };
  }, [url, open, version]);
  async function loadOlder() {
    if (!open || loading || !nextCursor || olderRequest.current) return;
    const controller = new AbortController();
    olderRequest.current = controller;
    setLoadingOlder(true);
    setOlderError("");
    try {
      const response = await fetch(
        `${url}&before=${encodeURIComponent(nextCursor)}`,
        {
          signal: controller.signal,
          cache: "no-store",
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!controller.signal.aborted) {
        setChats((current) => {
          const ids = new Set(current.map((chat) => chat.id));
          return [
            ...data.chats.filter((chat: AiChat) => !ids.has(chat.id)),
            ...current,
          ];
        });
        setNextCursor(data.nextCursor);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setOlderError(
          error instanceof Error
            ? error.message
            : "이전 대화를 불러오지 못했습니다.",
        );
    } finally {
      if (olderRequest.current === controller) {
        olderRequest.current = null;
        setLoadingOlder(false);
      }
    }
  }
  const append = useCallback((chat: AiChat) => {
    appended.current.push(chat);
    setChats((current) =>
      current.some((item) => item.id === chat.id)
        ? current
        : [...current, chat],
    );
    useWorkspace.getState().refreshAiConversations();
  }, []);
  return {
    chats,
    loading,
    loadingOlder,
    error,
    olderError,
    loadedVersion,
    nextCursor,
    loadOlder,
    append,
    retry: () => {
      setLoading(true);
      setVersion((v) => v + 1);
    },
  };
}
