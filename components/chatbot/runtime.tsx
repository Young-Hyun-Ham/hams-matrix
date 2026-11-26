"use client";
import { createContext, useContext } from "react";
import { useQuery, useQueryClient, type Query } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import type { User } from "@/lib/types";
import type { Graph, Mode, Artifact } from "@/lib/chatbot/types";
import type { DocumentFormat } from "@/lib/chatbot/document-formats";
export type Draft = {
  prompt: string;
  mode: Mode;
  format?: DocumentFormat;
  modelId: string;
  artifact?: Artifact;
  attachments: { id: string; name: string; mime: string }[];
};
export type Simulation = {
  scenarioId?: string;
  title?: string;
  definition: Graph;
};
export const Runtime = createContext<{
  user: User;
  drafts: Record<string, Draft>;
  saveDraft: (id: string, draft: Draft) => void;
  openSimulation: (config: Simulation, onClose?: () => void) => void;
  showRunHistory: () => void;
} | null>(null);
export function useChatbot() {
  const r = useContext(Runtime);
  if (!r) throw Error("ChatbotHost is required");
  return r;
}
export function useChatbotQuery<T>(
  path: string,
  enabled: boolean,
  active?: (data: T) => boolean,
  fresh = false,
) {
  const { user } = useChatbot(),
    { scope, policy } = useWorkspaceQueryPolicy({
      userId: user.id,
      workspaceId: user.workspaceId,
    });
  return useQuery<T>({
    queryKey: matrixKeys.chatbot(scope, path),
    queryFn: ({ signal }) => requestJson<T>(`/api/chatbot/${path}`, { signal }),
    ...policy,
    enabled,
    ...(fresh ? { staleTime: 0 } : {}),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query: Query<T>) =>
      enabled && active && query.state.data && active(query.state.data)
        ? 1000
        : false,
  });
}
export function useChatbotClient() {
  const { user } = useChatbot(),
    client = useQueryClient(),
    scope = { userId: user.id, workspaceId: user.workspaceId };
  return {
    send: <T,>(path: string, method = "POST", value?: unknown) =>
      requestJson<T>(`/api/chatbot/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      }),
    refresh: () =>
      client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "chatbot"],
      }),
  };
}
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "요청을 처리하지 못했습니다.";
