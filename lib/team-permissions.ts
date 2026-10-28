import "server-only";
import type { Client } from "@libsql/client";
import type { User } from "./types";
import { HttpError } from "./auth";
export const projectRoleSql = "CASE WHEN p.owner_id=m.user_id THEN 'owner' ELSE COALESCE(m.role,'viewer') END";
export async function requireTeamOwner(executor: Pick<Client, "execute">, user: User) {
  const row = (await executor.execute({ sql: "SELECT w.owner_id FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? WHERE w.id=? AND m.role='owner' AND w.owner_id=?", args: [user.id, user.workspaceId, user.id] })).rows[0];
  if (!row) throw new HttpError(403, "팀 owner만 구성원을 관리할 수 있습니다.");
}
export async function requireProjectOwner(executor: Pick<Client, "execute">, user: User, projectId: string) {
  const row = (await executor.execute({ sql: "SELECT p.id FROM projects p JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id AND m.user_id=? WHERE p.id=? AND p.workspace_id=? AND p.owner_id=?", args: [user.id, projectId, user.workspaceId, user.id] })).rows[0];
  if (!row) throw new HttpError(403, "해당 프로젝트 owner만 구성원 권한을 관리할 수 있습니다.");
}
