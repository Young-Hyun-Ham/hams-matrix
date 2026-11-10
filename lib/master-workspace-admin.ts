import "server-only";
import { db } from "./db";
import { HttpError } from "./auth";
import type { User } from "./types";
import type { Executor } from "./product-access";
import { noStore, paging, searchValue } from "./admin-query";

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

export async function handleMasterWorkspace(
  request: Request,
  user: User,
  segments: string[],
) {
  const workspace = await masterWorkspaceScope(user);
  if (request.method !== "GET")
    throw new HttpError(
      405,
      "상품 회원 지원은 슈퍼관리자설정에서 진행해 주세요.",
    );
  const resource = segments[0] ?? "overview",
    url = new URL(request.url);
  if (resource === "overview") {
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
    return Response.json(
      {
        workspaces: [{ id: workspace.id, name: workspace.name }],
        projects,
        used,
      },
      noStore,
    );
  }
  const { page: requestedPage, pageSize } = paging(url);
  if (resource === "members") {
    const projectId = url.searchParams.get("projectId") ?? "",
      q = searchValue(url);
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
      return Response.json({ members, total, page, pageSize }, noStore);
    } finally {
      tx.close();
    }
  }
  if (resource === "history") {
    const tx = await db().transaction("read");
    try {
      if (segments[1] && segments[2]) {
        const row = (
          await tx.execute({
            sql: "SELECT before_json AS beforeJson,after_json AS afterJson FROM audit_logs WHERE workspace_id=? AND id=? AND ?='audit'",
            args: [workspace.id, segments[2], segments[1]],
          })
        ).rows[0];
        if (!row)
          throw new HttpError(404, "워크스페이스 이력을 찾을 수 없습니다.");
        return Response.json(
          {
            beforeJson: JSON.parse(String(row.beforeJson ?? "{}")),
            afterJson: JSON.parse(String(row.afterJson ?? "{}")),
          },
          noStore,
        );
      }
      const total = Number(
        (
          await tx.execute({
            sql: "SELECT count(*) AS n FROM audit_logs WHERE workspace_id=?",
            args: [workspace.id],
          })
        ).rows[0].n,
      );
      const page = Math.min(
        requestedPage,
        Math.max(1, Math.ceil(total / pageSize)),
      );
      const entries = (
        await tx.execute({
          sql: "SELECT 'audit' AS source,id,occurred_at AS occurredAt,actor_name AS actorName,action FROM audit_logs WHERE workspace_id=? ORDER BY occurred_at DESC,id DESC LIMIT ? OFFSET ?",
          args: [workspace.id, pageSize, (page - 1) * pageSize],
        })
      ).rows;
      await tx.commit();
      return Response.json({ entries, total, page, pageSize }, noStore);
    } finally {
      tx.close();
    }
  }
  throw new HttpError(404, "관리 항목을 찾을 수 없습니다.");
}
