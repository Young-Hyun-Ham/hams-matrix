import type { ProjectPermissions } from "@/lib/project-permission-model";
import type { ProjectRole } from "@/lib/plan-types";
import type { QueryClient } from "@tanstack/react-query";
import { matrixKeys, type QueryScope } from "./keys";
import { requestJson } from "./browser-fetch";
import { RequestError } from "./error-messages";

export type ProjectAccess = {
  projectId: string;
  userId: string;
  workspaceId: string;
  projectRole: ProjectRole;
  ownerId: string;
  permissionVersion: number;
  permissionsByTab: ProjectPermissions;
};

export function projectAccessQuery(scope: QueryScope, projectId: string) {
  return {
    queryKey: [...matrixKeys.scope(scope), "project", projectId, "access"],
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const access = await requestJson<ProjectAccess>(
        `/api/projects/${encodeURIComponent(projectId)}/access`,
        { signal },
      );
      if (
        access.userId !== scope.userId ||
        access.workspaceId !== scope.workspaceId ||
        access.projectId !== projectId
      )
        throw new RequestError(403, "ACCESS_SCOPE_CHANGED");
      return access;
    },
    staleTime: 0,
    retry: false as const,
    refetchOnWindowFocus: false as const,
    refetchOnReconnect: false as const,
    refetchInterval: false as const,
  };
}

// staleTime 0 forces a current read; concurrent checks share an in-flight GET.
export function latestProjectAccess(
  client: QueryClient,
  scope: QueryScope,
  projectId: string,
) {
  return client.query(projectAccessQuery(scope, projectId));
}
