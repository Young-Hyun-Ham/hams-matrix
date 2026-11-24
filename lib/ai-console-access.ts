import "server-only";
import { db } from "./db";
import { HttpError } from "./auth";
import { projectPermissionAccess } from "./project-permissions";
import type { Executor } from "./product-access";
import type { User } from "./types";
import { workspacePlan } from "./plans";

export async function requireConsoleOwner(
  user: User,
  projectId: string,
  executor: Executor = db(),
) {
  if (!projectId || projectId.length > 100)
    throw new HttpError(400, "새창 진입 확인 프로젝트를 선택해 주세요.");
  const access = await projectPermissionAccess(executor, user, projectId);
  if (access.ownerId !== user.id || access.projectRole !== "owner")
    throw new HttpError(403, "프로젝트 owner만 새창을 사용할 수 있습니다.");
  return access;
}

// The caller must first resolve the existing administrator workspace scope.
export async function consoleOwnedProjects(user: User) {
  await workspacePlan(user.id, user.workspaceId);
  const result = await db().execute({
    sql: "SELECT p.id,p.name FROM projects p JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id AND m.user_id=? JOIN workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id WHERE p.workspace_id=? AND p.owner_id=? ORDER BY p.name,p.id",
    args: [user.id, user.workspaceId, user.id],
  });
  return result.rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
}
