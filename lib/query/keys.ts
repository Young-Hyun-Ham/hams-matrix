export type QueryScope = { userId: string; workspaceId: string };
export const matrixKeys = {
  builder: (s: QueryScope, path?: string) =>
    [...matrixKeys.scope(s), "builder", ...(path ? [path] : [])] as const,
  consoleAccess: (s: QueryScope, endpoint: string) =>
    [...matrixKeys.scope(s), "console-access", endpoint] as const,
  intentClassifications: (s: QueryScope, projectId: string) =>
    [
      ...matrixKeys.scope(s),
      "project",
      projectId,
      "intent-classifications",
    ] as const,
  guardrailApprovals: (s: QueryScope, endpoint: string) =>
    [...matrixKeys.scope(s), "guardrail-approvals", endpoint] as const,
  guardrailApproval: (s: QueryScope, endpoint: string, id: string) =>
    [...matrixKeys.guardrailApprovals(s, endpoint), "detail", id] as const,
  guardrailOverview: (s: QueryScope, endpoint: string) =>
    [...matrixKeys.scope(s), "guardrail-overview", endpoint] as const,
  sharedAnswers: (s: QueryScope, projectId: string) =>
    [...matrixKeys.scope(s), "project", projectId, "shared-answers"] as const,
  projectRag: (s: QueryScope, projectId: string) =>
    [...matrixKeys.scope(s), "project", projectId, "rag"] as const,
  image: (
    s: QueryScope,
    endpoint: string,
    sourceIdentity: string | number | null = null,
  ) => [...matrixKeys.scope(s), "image", endpoint, { sourceIdentity }] as const,
  scope: (s: QueryScope) => ["matrix", s.userId, s.workspaceId] as const,
  systemSettings: (s: QueryScope) =>
    [...matrixKeys.scope(s), "system-settings"] as const,
  notifications: (s: QueryScope) =>
    [...matrixKeys.scope(s), "super-admin", "notifications"] as const,
  me: (s: QueryScope) => [...matrixKeys.scope(s), "me"] as const,
  projects: (s: QueryScope) => [...matrixKeys.scope(s), "projects"] as const,
  dashboards: (s: QueryScope) => [...matrixKeys.scope(s), "dashboard"] as const,
  dashboard: (s: QueryScope, projectId = "") =>
    [...matrixKeys.dashboards(s), projectId] as const,
  artifacts: (s: QueryScope, id: string) =>
    [...matrixKeys.scope(s), "project", id, "artifacts"] as const,
};
