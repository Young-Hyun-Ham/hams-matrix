"use client";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "./workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { teamRequestJson } from "@/lib/query/team-fetch";
import type { TeamMember } from "@/lib/project-types";
export function useTeamMembers(projectId = "", enabled = true) {
  const { scope, policy } = useWorkspaceQueryPolicy();
  return useQuery({
    queryKey: [...matrixKeys.scope(scope), "team", "members", { projectId }],
    queryFn: ({ signal }) =>
      teamRequestJson<{
        members: TeamMember[];
        canManage: boolean;
        canAdd: boolean;
      }>(
        `/api/team/members${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`,
        { signal },
      ),
    ...policy,
    enabled,
  });
}
