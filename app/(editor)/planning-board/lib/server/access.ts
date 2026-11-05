import "server-only";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import type { User } from "@/lib/types";
import { requireProjectPermission } from "@/lib/project-permissions";
export type Executor = Pick<Client, "execute">;
export type Scope = { projectId: string; screenId: string };
export async function access(
  user: User,
  scope: Scope,
  write = false,
  executor: Executor = db(),
) {
  const permissions = await requireProjectPermission(
    executor,
    user,
    scope.projectId,
    "screen",
    write ? "UPDATE" : "READ",
  );
  const row = (
    await executor.execute({
      sql: "SELECT * FROM project_artifacts WHERE id=? AND project_id=? AND workspace_id=? AND kind='screen' AND deleted_at IS NULL",
      args: [scope.screenId, scope.projectId, user.workspaceId],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "화면설계서를 찾을 수 없습니다.");
  return { permissions, screen: row };
}
export async function boardRow(
  user: User,
  scope: Scope,
  executor: Executor = db(),
) {
  return (
    await executor.execute({
      sql: "SELECT * FROM planning_boards WHERE workspace_id=? AND project_id=? AND screen_artifact_id=?",
      args: [user.workspaceId, scope.projectId, scope.screenId],
    })
  ).rows[0];
}
export function scoped(user: User, scope: Scope) {
  return [user.workspaceId, scope.projectId, scope.screenId];
}
