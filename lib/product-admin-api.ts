import { historyFilter } from "./admin-history-query";
import "server-only";
import { db } from "./db";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
} from "./auth";
import { productAdminScope } from "./product-access";
import { handleMasterWorkspace } from "./master-workspace-admin";
import { changeProductMember } from "./plan-products";
import { paging, searchValue, noStore } from "./admin-query";

export async function handleProductAdmin(
  request: Request,
  segments: string[],
  superMode = false,
) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    if (!superMode && segments[0] === "workspace")
      return await handleMasterWorkspace(request, user, segments.slice(1));
    const requested = segments[0] === "me" ? undefined : segments[0];
    const product = await productAdminScope(user, requested, db(), superMode);
    const resource = segments[1] ?? "overview",
      url = new URL(request.url);
    if (request.method !== "GET") checkOrigin(request);
    if (request.method === "POST" && resource === "members") {
      await changeProductMember(
        user,
        product.id,
        await body(request),
        superMode,
      );
      return Response.json({ ok: true }, noStore);
    }
    if (request.method !== "GET")
      throw new HttpError(405, "지원하지 않는 요청입니다.");
    if (resource === "overview") {
      const workspaces = (
        await db().execute({
          sql: "SELECT id,name,plan FROM workspaces WHERE product_id=? ORDER BY name,id",
          args: [product.id],
        })
      ).rows;
      const projects = (
        await db().execute({
          sql: "SELECT p.id,p.name FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE w.product_id=? ORDER BY p.name,p.id",
          args: [product.id],
        })
      ).rows;
      const used = Number(
        (
          await db().execute({
            sql: "SELECT count(*) AS n FROM product_members WHERE product_id=? AND status='active'",
            args: [product.id],
          })
        ).rows[0].n,
      );
      return Response.json({ product, workspaces, projects, used }, noStore);
    }
    if (resource === "candidates") {
      const email = url.searchParams.get("email")?.trim().toLowerCase() ?? "";
      if (!email || email.length > 254 || !email.includes("@"))
        throw new HttpError(400, "가입한 이메일 전체를 입력해 주세요.");
      const { rateLimit } = await import("./auth");
      await rateLimit(`product-candidate:${user.id}`, 30);
      const members = (
        await db().execute({
          sql: "SELECT u.id,u.name,u.email,u.management_version AS version FROM users u WHERE u.email=? AND u.account_role='user' AND u.onboarding_complete=1 AND NOT EXISTS(SELECT 1 FROM product_members m WHERE m.user_id=u.id AND m.status='active') LIMIT 1",
          args: [email],
        })
      ).rows;
      return Response.json({ members }, noStore);
    }
    if (resource === "members") {
      const projectId = url.searchParams.get("projectId") ?? "";
      if (
        projectId &&
        projectId !== "unassigned" &&
        !(
          await db().execute({
            sql: "SELECT p.id FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=? AND w.product_id=?",
            args: [projectId, product.id],
          })
        ).rows.length
      )
        throw new HttpError(404, "상품의 프로젝트를 찾을 수 없습니다.");
      const q = searchValue(url),
        requestedPage = paging(url);
      const where = `WHERE m.product_id=? AND m.status='active' AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\') ${segments[2] ? "AND u.id=?" : ""} ${projectId === "unassigned" ? "AND NOT EXISTS(SELECT 1 FROM project_members pm JOIN projects pr ON pr.id=pm.project_id JOIN workspaces w ON w.id=pr.workspace_id WHERE pm.user_id=u.id AND w.product_id=m.product_id)" : projectId ? "AND EXISTS(SELECT 1 FROM project_members pm JOIN projects pr ON pr.id=pm.project_id JOIN workspaces w ON w.id=pr.workspace_id WHERE pm.user_id=u.id AND pr.id=? AND w.product_id=m.product_id)" : ""}`;
      const args = [
        product.id,
        q,
        q,
        ...(segments[2] ? [segments[2]] : []),
        ...(projectId && projectId !== "unassigned" ? [projectId] : []),
      ];
      const tx = await db().transaction("read");
      try {
        const from =
          "FROM product_members m JOIN users u ON u.id=m.user_id JOIN user_subscriptions s ON s.user_id=u.id ";
        const total = Number(
          (
            await tx.execute({
              sql: `SELECT count(*) AS n ${from}${where}`,
              args,
            })
          ).rows[0].n,
        );
        const page = Math.min(
          requestedPage.page,
          Math.max(1, Math.ceil(total / requestedPage.pageSize)),
        );
        const members = (
          await tx.execute({
            sql: `SELECT u.id,u.name,u.email,u.account_role AS accountRole,u.management_version AS version,m.role,s.plan_code AS plan,s.product_id AS productId,CASE WHEN s.product_id=m.product_id AND s.plan_code=? THEN 1 ELSE 0 END AS planMatches ${from}${where} ORDER BY u.name,u.id LIMIT ? OFFSET ?`,
            args: [
              product.plan_code,
              ...args,
              requestedPage.pageSize,
              (page - 1) * requestedPage.pageSize,
            ],
          })
        ).rows;
        await tx.commit();
        if (segments[2] && !members.length)
          throw new HttpError(404, "상품 회원을 찾을 수 없습니다.");
        return Response.json(
          segments[2]
            ? { member: members[0], canEditRole: false }
            : { members, total, page, pageSize: requestedPage.pageSize },
          noStore,
        );
      } finally {
        tx.close();
      }
    }
    if (resource === "history") {
      const scope = `SELECT 'product' AS source,e.id,e.created_at AS occurredAt,e.actor_id AS actorId,u.name AS actorName,e.action,e.target_id AS resourceId,e.before_json AS beforeJson,e.after_json AS afterJson FROM product_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.product_id=? UNION ALL SELECT 'audit',a.id,a.occurred_at,a.actor_id,a.actor_name,a.action,a.resource_id,a.before_json,a.after_json FROM audit_logs a JOIN workspaces w ON w.id=a.workspace_id WHERE w.product_id=?`;
      if (segments[2] && segments[3]) {
        const row = (
          await db().execute({
            sql: `SELECT * FROM (${scope}) WHERE source=? AND id=?`,
            args: [product.id, product.id, segments[2], segments[3]],
          })
        ).rows[0];
        if (!row) throw new HttpError(404, "상품 이력을 찾을 수 없습니다.");
        return Response.json(
          {
            ...row,
            beforeJson: JSON.parse(String(row.beforeJson ?? "{}")),
            afterJson: JSON.parse(String(row.afterJson ?? "{}")),
          },
          noStore,
        );
      }
      const workspaces = (
        await db().execute({
          sql: "SELECT id FROM workspaces WHERE product_id=?",
          args: [product.id],
        })
      ).rows.map((row) => String(row.id));
      const projectId = url.searchParams.get("projectId") ?? "";
      if (
        projectId &&
        projectId !== "unassigned" &&
        !(
          await db().execute({
            sql: "SELECT p.id FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=? AND w.product_id=?",
            args: [projectId, product.id],
          })
        ).rows.length
      )
        throw new HttpError(404, "상품의 프로젝트를 찾을 수 없습니다.");
      const filter = historyFilter(url, workspaces);
      const { page: requestedPage, pageSize } = paging(url);
      const total = Number(
        (
          await db().execute({
            sql: `SELECT count(*) AS n FROM (${scope}) h ${filter.where}`,
            args: [product.id, product.id, ...filter.args],
          })
        ).rows[0].n,
      );
      const page = Math.min(
        requestedPage,
        Math.max(1, Math.ceil(total / pageSize)),
      );
      const entries = (
        await db().execute({
          sql: `SELECT source,id,occurredAt,actorId,actorName,action,resourceId FROM (${scope}) h ${filter.where} ORDER BY occurredAt DESC,id DESC LIMIT ? OFFSET ?`,
          args: [
            product.id,
            product.id,
            ...filter.args,
            pageSize,
            (page - 1) * pageSize,
          ],
        })
      ).rows;
      return Response.json({ entries, total, page, pageSize }, noStore);
    }
    throw new HttpError(404, "관리 항목을 찾을 수 없습니다.");
  } catch (error) {
    return errorResponse(error);
  }
}
