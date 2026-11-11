import "server-only";
import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { User } from "@/lib/types";
import { matrixKeys } from "@/lib/query/keys";
import { getWorkspaceSystemSettings } from "@/lib/system-settings/server";
import { createWorkspaceQueryPolicy } from "@/lib/query/policy";
import { serverGetJson } from "@/lib/query/server-fetch";
export async function AdminProductBoundary({
  user,
  base,
  tab,
  children,
}: {
  user: User;
  base: string;
  tab: string;
  children: ReactNode;
}) {
  const client = new QueryClient(),
    scope = { userId: user.id, workspaceId: user.workspaceId };
  const settings = await getWorkspaceSystemSettings(user),
    policy = createWorkspaceQueryPolicy(settings);
  const overview = await client
    .query({
      queryKey: [...matrixKeys.scope(scope), "admin", base, "overview"],
      queryFn: ({ signal }) =>
        serverGetJson<{ workspaces: { id: string; name: string }[] }>(base, {
          signal,
        }),
      ...policy,
    })
    .catch(() => undefined);
  if (tab === "guardrails") {
    const workspaceId = overview?.workspaces?.[0]?.id;
    if (workspaceId) {
      const endpoint = `/api/admin/ai-guardrails?workspaceId=${encodeURIComponent(workspaceId)}`;
      await client
        .query({
          queryKey: [...matrixKeys.scope(scope), "guardrail", endpoint],
          queryFn: ({ signal }) => serverGetJson(endpoint, { signal }),
          ...policy,
        })
        .catch(() => undefined);
    }
  } else {
    const resource = tab === "history" ? "history" : "members";
    const filters = { page: 1, pageSize: 20, q: "", projectId: "" };
    await client
      .query({
        queryKey: [
          ...matrixKeys.scope(scope),
          "admin",
          base,
          resource,
          filters,
        ],
        queryFn: ({ signal }) =>
          serverGetJson(
            `${base}/${resource}?${new URLSearchParams({ page: "1", pageSize: "20", q: "", projectId: "" })}`,
            { signal },
          ),
        ...policy,
      })
      .catch(() => undefined);
  }
  return (
    <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>
  );
}
