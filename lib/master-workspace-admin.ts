import { historyFilter } from "./admin-history-query";
import "server-only";
import { db } from "./db";
import { HttpError } from "./auth";
import type { User } from "./types";
import type { Executor } from "./product-access";
import { pageInput, searchPattern, type AdminListQuery } from "./admin-query";

export async function masterWorkspaceScope(
  user: User,
  workspaceId = user.workspaceId,
  executor: Executor = db(),
) {
  const row = (
    await executor.execute({
      sql: "SELECT w.id,w.name,w.plan FROM users u JOIN workspace_members m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id WHERE u.id=? AND u.account_role='master' AND w.id=? AND m.role IN ('owner','admin')",
      args: [user.id, workspaceId],
    })
  ).rows[0];
  if (!row)
    throw new HttpError(
      403,
      "관리 권한이 있는 워크스페이스만 관리할 수 있습니다.",
    );
  return row;
}

type WorkspaceScope = Awaited<ReturnType<typeof masterWorkspaceScope>>;

export async function getWorkspaceAdminOverview(workspace: WorkspaceScope) {
  const projects = (
    await db().execute({
      sql: "SELECT id,name FROM projects WHERE workspace_id=? ORDER BY name,id",
      args: [workspace.id],
    })
  ).rows;
  const used = Number(
    (
      await db().execute({
        sql: "SELECT count(*) AS n FROM workspace_members WHERE workspace_id=?",
        args: [workspace.id],
      })
    ).rows[0].n,
  );
  return {
    workspaces: [{ id: workspace.id, name: workspace.name }],
    projects,
    used,
  };
}

export async function listWorkspaceMembers(
  workspace: WorkspaceScope,
  input: AdminListQuery,
) {
  const { page: requestedPage, pageSize } = pageInput(
    input.page,
    input.pageSize,
  );
  const projectId = input.projectId,
    q = searchPattern(input.q);
  if (
    projectId &&
    projectId !== "unassigned" &&
    !(
      await db().execute({
        sql: "SELECT id FROM projects WHERE id=? AND workspace_id=?",
        args: [projectId, workspace.id],
      })
    ).rows.length
  )
    throw new HttpError(404, "워크스페이스의 프로젝트를 찾을 수 없습니다.");
  const where = `WHERE m.workspace_id=? AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\') ${projectId === "unassigned" ? "AND NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.workspace_id=m.workspace_id AND pm.user_id=m.user_id)" : projectId ? "AND EXISTS(SELECT 1 FROM project_members pm WHERE pm.workspace_id=m.workspace_id AND pm.user_id=m.user_id AND pm.project_id=?)" : ""}`;
  const args = [
    workspace.id,
    q,
    q,
    ...(projectId && projectId !== "unassigned" ? [projectId] : []),
  ];
  const tx = await db().transaction("read");
  try {
    const from =
      "FROM workspace_members m JOIN users u ON u.id=m.user_id LEFT JOIN user_subscriptions s ON s.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id ";
    const total = Number(
      (
        await tx.execute({
          sql: `SELECT count(*) AS n ${from}${where}`,
          args,
        })
      ).rows[0].n,
    );
    const page = Math.min(
      requestedPage,
      Math.max(1, Math.ceil(total / pageSize)),
    );
    const members = (
      await tx.execute({
        sql: `SELECT u.id,u.name,u.email,u.account_role AS accountRole,u.management_version AS version,m.role,CASE WHEN s.plan_code=w.plan AND s.product_id IS w.product_id THEN 1 ELSE 0 END AS planMatches ${from}${where} ORDER BY u.name,u.id LIMIT ? OFFSET ?`,
        args: [...args, pageSize, (page - 1) * pageSize],
      })
    ).rows;
    await tx.commit();
    return { members, total, page, pageSize };
  } finally {
    tx.close();
  }
}

export async function getWorkspaceHistoryDetail(
  workspace: WorkspaceScope,
  source: string,
  id: string,
) {
  const tx = await db().transaction("read");
  try {
    const row = (
      await tx.execute({
        sql: "SELECT before_json AS beforeJson,after_json AS afterJson FROM audit_logs WHERE workspace_id=? AND id=? AND ?='audit'",
        args: [workspace.id, id, source],
      })
    ).rows[0];
    if (!row) throw new HttpError(404, "워크스페이스 이력을 찾을 수 없습니다.");
    return {
      beforeJson: JSON.parse(String(row.beforeJson ?? "{}")),
      afterJson: JSON.parse(String(row.afterJson ?? "{}")),
    };
  } finally {
    tx.close();
  }
}

export async function listWorkspaceHistory(
  workspace: WorkspaceScope,
  input: AdminListQuery,
) {
  const { page: requestedPage, pageSize } = pageInput(
    input.page,
    input.pageSize,
  );
  const tx = await db().transaction("read");
  try {
    const projectId = input.projectId;
    if (
      projectId &&
      projectId !== "unassigned" &&
      !(
        await tx.execute({
          sql: "SELECT id FROM projects WHERE id=? AND workspace_id=?",
          args: [projectId, workspace.id],
        })
      ).rows.length
    )
      throw new HttpError(404, "워크스페이스의 프로젝트를 찾을 수 없습니다.");
    const filter = historyFilter(input, [String(workspace.id)]);
    const history =
      "SELECT 'audit' AS source,id,occurred_at AS occurredAt,actor_id AS actorId,actor_name AS actorName,action FROM audit_logs WHERE workspace_id=?";
    const total = Number(
      (
        await tx.execute({
          sql: `SELECT count(*) AS n FROM (${history}) h ${filter.where}`,
          args: [workspace.id, ...filter.args],
        })
      ).rows[0].n,
    );
    const page = Math.min(
      requestedPage,
      Math.max(1, Math.ceil(total / pageSize)),
    );
    const entries = (
      await tx.execute({
        sql: `SELECT * FROM (${history}) h ${filter.where} ORDER BY occurredAt DESC,id DESC LIMIT ? OFFSET ?`,
        args: [workspace.id, ...filter.args, pageSize, (page - 1) * pageSize],
      })
    ).rows;
    await tx.commit();
    return { entries, total, page, pageSize };
  } finally {
    tx.close();
  }
}
