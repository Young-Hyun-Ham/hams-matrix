"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "./workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import type { AiConversation } from "@/lib/ai-context";
export function useConversationMutation(projectId: string, convId: string) {
  const { scope } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      method = "PATCH",
      input,
    }: {
      method?: string;
      input: object;
    }) =>
      requestJson<{ conversation: AiConversation }>(
        `/api/ai/conversations/${encodeURIComponent(convId)}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ...input }),
        },
      ),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: [
          ...matrixKeys.scope(scope),
          "project",
          projectId,
          "conversations",
        ],
      });
    },
  });
}
