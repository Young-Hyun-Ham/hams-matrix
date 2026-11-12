import { searchPattern } from "./admin-query";

// Scope the actor's current project assignments as the member search does.
// The outer query must already restrict history rows to the authorized scope.
export function historyFilter(
  input: { q: string; projectId: string },
  workspaceIds: string[],
) {
  const q = searchPattern(input.q);
  const projectId = input.projectId;
  const clauses: string[] = [];
  const args: string[] = [];
  if (input.q.trim()) {
    clauses.push(
      "(h.actorName LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM users hu WHERE hu.id=h.actorId AND (hu.name LIKE ? ESCAPE '\\' OR hu.email LIKE ? ESCAPE '\\')))",
    );
    args.push(q, q, q);
  }
  if (projectId) {
    const placeholders = workspaceIds.map(() => "?").join(",") || "NULL";
    clauses.push(
      `${projectId === "unassigned" ? "NOT " : ""}EXISTS (SELECT 1 FROM project_members hp WHERE hp.user_id=h.actorId AND hp.workspace_id IN (${placeholders})${projectId === "unassigned" ? "" : " AND hp.project_id=?"})`,
    );
    args.push(...workspaceIds);
    if (projectId !== "unassigned") args.push(projectId);
  }
  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    args,
  };
}
