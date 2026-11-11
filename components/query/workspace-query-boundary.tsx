import "server-only";
import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Preferences } from "@/stores/preferences";
import type { User } from "@/lib/types";
import { getWorkspaceSystemSettings } from "@/lib/system-settings/server";
import { matrixKeys } from "@/lib/query/keys";
import { createWorkspaceQueryPolicy } from "@/lib/query/policy";
import { serverGetJson } from "@/lib/query/server-fetch";
import { WorkspaceQueryRuntime } from "./workspace-query-runtime";
export async function WorkspaceQueryBoundary({
  user,
  children,
  notifications = false,
  preferences,
}: {
  user: User;
  children: ReactNode;
  notifications?: boolean;
  preferences?: Preferences;
}) {
  const scope = { userId: user.id, workspaceId: user.workspaceId };
  const settings = await getWorkspaceSystemSettings(user);
  const client = new QueryClient();
  client.setQueryData(matrixKeys.systemSettings(scope), settings);
  client.setQueryData(matrixKeys.me(scope), { user });
  if (preferences)
    client.setQueryData(
      [...matrixKeys.scope(scope), "preferences"],
      preferences,
    );
  if (notifications && user.accountRole === "master") {
    await client
      .query({
        queryKey: [...matrixKeys.notifications(scope), "count"],
        queryFn: ({ signal }) =>
          serverGetJson("/api/super-admin/notifications/count", { signal }),
        ...createWorkspaceQueryPolicy(settings),
      })
      .catch(() => undefined);
  }
  return (
    <HydrationBoundary state={dehydrate(client)}>
      <WorkspaceQueryRuntime
        key={`${user.id}:${user.workspaceId}`}
        scope={scope}
        initialSettings={settings}
      >
        {children}
      </WorkspaceQueryRuntime>
    </HydrationBoundary>
  );
}
