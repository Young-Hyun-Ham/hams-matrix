import "server-only";
import { db } from "./db";
import { HttpError, rateLimit } from "./auth";
import type { User } from "./types";
import type { Product } from "./product-access";
import { pageInput, searchPattern, type AdminListQuery } from "./admin-query";
import { historyFilter } from "./admin-history-query";

// Callers must establish the product scope before invoking these queries.
export async function getProductAdminOverview(product: Product) {
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
  return { product, workspaces, projects, used };
}

export async function findProductMemberCandidates(user: User, email: string) {
  if (!email || email.length > 254 || !email.includes("@"))
    throw new HttpError(400, "가입한 이메일 전체를 입력해 주세요.");
  await rateLimit(`product-candidate:${user.id}`, 30);
  const members = (
    await db().execute({
      sql: "SELECT u.id,u.name,u.email,u.management_version AS version FROM users u WHERE u.email=? AND u.account_role='user' AND u.onboarding_complete=1 AND NOT EXISTS(SELECT 1 FROM product_members m WHERE m.user_id=u.id AND m.status='active') LIMIT 1",
      args: [email],
    })
  ).rows;
  return members;
}

async function queryProductMembers(
  product: Product,
  input: AdminListQuery,
  memberId?: string,
) {
  const projectId = input.projectId;
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
  const q = searchPattern(input.q),
    requestedPage = pageInput(input.page, input.pageSize);
  const where = `WHERE m.product_id=? AND m.status='active' AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\') ${memberId ? "AND u.id=?" : ""} ${projectId === "unassigned" ? "AND NOT EXISTS(SELECT 1 FROM project_members pm JOIN projects pr ON pr.id=pm.project_id JOIN workspaces w ON w.id=pr.workspace_id WHERE pm.user_id=u.id AND w.product_id=m.product_id)" : projectId ? "AND EXISTS(SELECT 1 FROM project_members pm JOIN projects pr ON pr.id=pm.project_id JOIN workspaces w ON w.id=pr.workspace_id WHERE pm.user_id=u.id AND pr.id=? AND w.product_id=m.product_id)" : ""}`;
  const args = [
    product.id,
    q,
    q,
    ...(memberId ? [memberId] : []),
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
    if (memberId && !members.length)
      throw new HttpError(404, "상품 회원을 찾을 수 없습니다.");
    return { members, total, page, pageSize: requestedPage.pageSize };
  } finally {
    tx.close();
  }
}

export async function listProductMembers(
  product: Product,
  input: AdminListQuery,
) {
  return queryProductMembers(product, input);
}

export async function getProductMember(
  product: Product,
  userId: string,
  input: AdminListQuery,
) {
  return (await queryProductMembers(product, input, userId)).members[0];
}

const productHistoryScope = `SELECT 'product' AS source,e.id,e.created_at AS occurredAt,e.actor_id AS actorId,u.name AS actorName,e.action,e.target_id AS resourceId,e.before_json AS beforeJson,e.after_json AS afterJson FROM product_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.product_id=? UNION ALL SELECT 'audit',a.id,a.occurred_at,a.actor_id,a.actor_name,a.action,a.resource_id,a.before_json,a.after_json FROM audit_logs a JOIN workspaces w ON w.id=a.workspace_id WHERE w.product_id=?`;

export async function getProductHistoryDetail(
  product: Product,
  source: string,
  id: string,
) {
  const row = (
    await db().execute({
      sql: `SELECT * FROM (${productHistoryScope}) WHERE source=? AND id=?`,
      args: [product.id, product.id, source, id],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "상품 이력을 찾을 수 없습니다.");
  return {
    ...row,
    beforeJson: JSON.parse(String(row.beforeJson ?? "{}")),
    afterJson: JSON.parse(String(row.afterJson ?? "{}")),
  };
}

export async function listProductHistory(
  product: Product,
  input: AdminListQuery,
) {
  const workspaces = (
    await db().execute({
      sql: "SELECT id FROM workspaces WHERE product_id=?",
      args: [product.id],
    })
  ).rows.map((row) => String(row.id));
  const projectId = input.projectId;
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
  const filter = historyFilter(input, workspaces);
  const { page: requestedPage, pageSize } = pageInput(
    input.page,
    input.pageSize,
  );
  const total = Number(
    (
      await db().execute({
        sql: `SELECT count(*) AS n FROM (${productHistoryScope}) h ${filter.where}`,
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
      sql: `SELECT source,id,occurredAt,actorId,actorName,action,resourceId FROM (${productHistoryScope}) h ${filter.where} ORDER BY occurredAt DESC,id DESC LIMIT ? OFFSET ?`,
      args: [
        product.id,
        product.id,
        ...filter.args,
        pageSize,
        (page - 1) * pageSize,
      ],
    })
  ).rows;
  return { entries, total, page, pageSize };
}
