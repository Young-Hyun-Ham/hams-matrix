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
  const [version, setVersion] = useState(0);
  const olderRequest = useRef<AbortController | null>(null);
  const appended = useRef<AiChat[]>([]);
  const projectId = conversation.projectId,
    convId = conversation.convId;
  const url = `/api/ai/chats?projectId=${encodeURIComponent(projectId)}&convId=${encodeURIComponent(convId)}`;
  useEffect(() => {
    if (!open) return;
    const appendStart = appended.current.length;
    const controller = new AbortController();
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const ids = new Set<string>(data.chats.map((chat: AiChat) => chat.id));
        setChats([
          ...data.chats,
          ...appended.current
            .slice(data.historyEnabled === false ? 0 : appendStart)
            .filter((chat) => !ids.has(chat.id)),
        ]);
        setNextCursor(data.nextCursor);
        setError("");
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
    return () => controller.abort();
  }, [url, open, version]);
  useEffect(() => () => olderRequest.current?.abort(), []);
  async function loadOlder() {
    if (!nextCursor || olderRequest.current) return;
    const controller = new AbortController();
    olderRequest.current = controller;
    setLoadingOlder(true);
    setError("");
    try {
      const response = await fetch(`${url}&before=${nextCursor}`, {
        signal: controller.signal,
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (!controller.signal.aborted) {
        setChats((current) => [...data.chats, ...current]);
        setNextCursor(data.nextCursor);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : "이전 대화를 불러오지 못했습니다.",
        );
    } finally {
      olderRequest.current = null;
      if (!controller.signal.aborted) setLoadingOlder(false);
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
    nextCursor,
    loadOlder,
    append,
    retry: () => {
      setLoading(true);
      setVersion((v) => v + 1);
    },
  };
}
