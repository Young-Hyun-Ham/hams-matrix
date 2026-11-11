"use client";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "./workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import type { User } from "@/lib/types";
export type WorkspacesResponse = {
  workspaces: { id: string; name: string; plan: string }[];
  current: string;
  user: User;
};
export function useWorkspaces(fallbackScope?: {
  userId: string;
  workspaceId: string;
}) {
  const { scope } = useWorkspaceQueryPolicy(fallbackScope);
  return useQuery({
    queryKey: [...matrixKeys.scope(scope), "workspaces"],
    queryFn: ({ signal }) =>
      requestJson<WorkspacesResponse>("/api/me/workspace", { signal }),
    enabled: Boolean(scope.userId && scope.workspaceId),
    staleTime: 0,
    retry: false,
    refetchInterval: 15000,
    refetchOnWindowFocus: "always",
  });
}
