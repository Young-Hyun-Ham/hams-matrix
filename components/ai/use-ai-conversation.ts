"use client";
import { useCallback, useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type {
  AiChat,
  AiConversation,
  AiConversationTurn,
} from "@/lib/ai-context";
import { useWorkspace } from "@/stores/workspace";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
type ChatPage = {
  chats: AiChat[];
  turns?: AiConversationTurn[];
  nextCursor: string | null;
  historyEnabled: boolean;
  conversation: AiConversation;
};
export function useAiConversation(conversation: AiConversation, open: boolean) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const [local, setLocal] = useState<{ scope: string; chats: AiChat[] }>({
    scope: "",
    chats: [],
  });
  const localScope = `${scope.userId}:${scope.workspaceId}:${conversation.projectId}:${conversation.convId}`;
  const query = useInfiniteQuery({
    queryKey: [
      ...matrixKeys.scope(scope),
      "project",
      conversation.projectId,
      "conversation",
      conversation.convId,
      "chats",
      "infinite",
    ],
    queryFn: ({ signal, pageParam }) =>
      requestJson<ChatPage>(
        `/api/ai/chats?${new URLSearchParams({ projectId: conversation.projectId, convId: conversation.convId, ...(pageParam ? { before: pageParam } : {}) })}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) =>
      page.historyEnabled === false
        ? undefined
        : (page.nextCursor ?? undefined),
    ...policy,
    enabled: open && Boolean(scope.userId && conversation.convId),
  });
  const latest = query.data?.pages[0];
  useEffect(() => {
    if (latest?.conversation)
      useWorkspace.getState().updateAiConversation(latest.conversation);
  }, [latest]);
  const ids = new Set<string>();
  const chats = [...(query.data?.pages ?? [])]
    .reverse()
    .flatMap((page) => page.chats)
    .filter((chat) => {
      if (ids.has(chat.id)) return false;
      ids.add(chat.id);
      return true;
    });
  for (const chat of local.scope === localScope ? local.chats : [])
    if (!ids.has(chat.id)) {
      chats.push(chat);
      ids.add(chat.id);
    }
  chats.sort((a, b) => (a.turnSeq ?? 0) - (b.turnSeq ?? 0));
  const turns = new Map<string, AiConversationTurn>();
  for (const page of query.data?.pages ?? [])
    for (const turn of page.turns ?? [])
      if ((turns.get(turn.id)?.version ?? 0) <= turn.version)
        turns.set(turn.id, turn);
  const append = useCallback(
    (chat: AiChat) => {
      setLocal((current) => ({
        scope: localScope,
        chats:
          current.scope !== localScope
            ? [chat]
            : [...current.chats.filter((item) => item.id !== chat.id), chat],
      }));
      client.setQueryData<InfiniteData<ChatPage>>(
        [
          ...matrixKeys.scope(scope),
          "project",
          conversation.projectId,
          "conversation",
          conversation.convId,
          "chats",
          "infinite",
        ],
        (current) => {
          if (
            !current?.pages.length ||
            current.pages[0].historyEnabled === false
          )
            return current;
          const existing = current.pages.findIndex(
            (page) =>
              page.turns?.some((turn) => turn.id === chat.turnId) ||
              page.chats.some((item) => item.id === chat.id),
          );
          const index = existing < 0 ? 0 : existing;
          return {
            ...current,
            pages: current.pages.map((page, i) =>
              i !== index
                ? page
                : {
                    ...page,
                    chats: [
                      ...page.chats.filter((item) => item.id !== chat.id),
                      chat,
                    ],
                    turns: page.turns?.map((turn) =>
                      turn.id === chat.turnId
                        ? {
                            ...turn,
                            chatId: chat.id,
                            status: "completed",
                            version: turn.version + 1,
                          }
                        : turn,
                    ),
                  },
            ),
          };
        },
      );
      useWorkspace.getState().refreshAiConversations();
    },
    [localScope, client, scope, conversation.projectId, conversation.convId],
  );
  return {
    chats,
    turns: [...turns.values()].sort((a, b) => a.seq - b.seq),
    loading: query.isLoading,
    revalidating: query.isFetching && !query.isFetchingNextPage,
    loadingOlder: query.isFetchingNextPage,
    error: query.isFetchNextPageError
      ? ""
      : resolveWorkspaceError(query.error, settings.errorMessages),
    olderError: query.isFetchNextPageError
      ? resolveWorkspaceError(query.error, settings.errorMessages)
      : "",
    loadedVersion: (latest?.chats.map((chat) => chat.id).join("|") ?? "")
      .split("")
      .reduce(
        (hash, character) => (hash * 31 + character.charCodeAt(0)) | 0,
        0,
      ),
    nextCursor: query.hasNextPage
      ? (query.data?.pages.at(-1)?.nextCursor ?? null)
      : null,
    loadOlder: async () => {
      if (open && query.hasNextPage && !query.isFetching)
        await query.fetchNextPage();
    },
    append,
    retry: () => {
      void query.refetch();
    },
  };
}
