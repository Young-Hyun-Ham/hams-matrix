export type QueryScope = { userId: string; workspaceId: string };
export const matrixKeys = {
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
