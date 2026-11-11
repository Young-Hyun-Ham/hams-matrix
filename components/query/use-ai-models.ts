"use client";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "./workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
export function useAiModels(enabled = true, image = false) {
  const { scope, policy } = useWorkspaceQueryPolicy();
  const path = image ? "/api/ai/image-models" : "/api/ai/models";
  return useQuery({
    queryKey: [
      ...matrixKeys.scope(scope),
      "ai",
      image ? "image-models" : "models",
    ],
    queryFn: ({ signal }) =>
      requestJson<{ models: string[]; defaultModel: string }>(path, { signal }),
    ...policy,
    enabled,
  });
}
