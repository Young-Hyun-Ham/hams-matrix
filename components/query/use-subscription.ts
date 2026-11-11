"use client";
import { useQuery } from "@tanstack/react-query";
import type { SubscriptionResponse } from "@/lib/query/types";
import { useWorkspaceQueryPolicy } from "./workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
export function useSubscription() {
  const { scope, policy } = useWorkspaceQueryPolicy();
  return useQuery({
    queryKey: [...matrixKeys.scope(scope), "subscription"],
    queryFn: ({ signal }) =>
      requestJson<SubscriptionResponse>("/api/me/subscription", { signal }),
    ...policy,
    enabled: Boolean(scope.userId && scope.workspaceId),
  });
}
