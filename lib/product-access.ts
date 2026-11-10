import "server-only";
import type { Client, Row } from "@libsql/client";
import { db } from "./db";
import { HttpError, requireUser } from "./auth";
import type { User } from "./types";

export type Executor = Pick<Client, "execute">;
export type Product = {
  id: string;
  name: string;
  plan_code: "team" | "business";
  status: string;
  version: number;
  member_limit: number | null;
  admin_limit: number | null;
  contract_version: number;
  ends_at: string | null;
};
export function productInfo(row: Row): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    plan_code: row.plan_code as Product["plan_code"],
    status: String(row.status),
    version: Number(row.version),
    member_limit: row.member_limit == null ? null : Number(row.member_limit),
    admin_limit: row.admin_limit == null ? null : Number(row.admin_limit),
    contract_version: Number(row.contract_version),
    ends_at: row.ends_at == null ? null : String(row.ends_at),
  };
}
export async function productById(
  id: string,
  executor: Executor = db(),
  active = true,
) {
  const row = (
    await executor.execute({
      sql: `SELECT p.*,c.member_limit,c.admin_limit,c.version AS contract_version,c.ends_at FROM plan_products p JOIN contracts c ON c.product_id=p.id AND c.status='active' WHERE p.id=? ${active ? "AND p.status='active' AND c.starts_at<=? AND (c.ends_at IS NULL OR c.ends_at>?)" : ""}`,
      args: active
        ? [id, new Date().toISOString(), new Date().toISOString()]
        : [id],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "사용 가능한 상품을 찾을 수 없습니다.");
  return productInfo(row);
}
export async function requireSuperAdmin() {
  const user = await requireUser({ allowPlanMismatch: true });
  if (user.accountRole !== "master")
    throw new HttpError(403, "슈퍼관리자만 사용할 수 있습니다.");
  return user;
}
export async function productAdminScope(
  user: User,
  requested?: string,
  executor: Executor = db(),
  superMode = false,
) {
  if (superMode) {
    const role = (
      await executor.execute({
        sql: "SELECT account_role FROM users WHERE id=?",
        args: [user.id],
      })
    ).rows[0];
    if (role?.account_role !== "master" || !requested)
      throw new HttpError(403, "슈퍼관리자와 대상 상품을 확인해 주세요.");
    return productById(requested, executor);
  }
  const row = (
    await executor.execute({
      sql: "SELECT m.product_id FROM users u JOIN product_members m ON m.user_id=u.id AND m.role='admin' AND m.status='active' JOIN plan_products p ON p.id=m.product_id JOIN user_subscriptions s ON s.user_id=u.id AND s.product_id=p.id AND s.plan_code=p.plan_code WHERE u.id=? AND ((u.account_role='biz_admin' AND p.plan_code='business') OR (u.account_role='team_admin' AND p.plan_code='team'))",
      args: [user.id],
    })
  ).rows[0];
  if (!row || (requested && requested !== row.product_id))
    throw new HttpError(403, "자신의 상품 관리자만 사용할 수 있습니다.");
  return productById(String(row.product_id), executor);
}
export async function requireProductAdmin(requested?: string) {
  const user = await requireUser({ allowPlanMismatch: true });
  return { user, product: await productAdminScope(user, requested) };
}
export async function productWorkspace(
  productId: string,
  workspaceId: string,
  executor: Executor = db(),
) {
  const row = (
    await executor.execute({
      sql: "SELECT id,name FROM workspaces WHERE id=? AND product_id=?",
      args: [workspaceId, productId],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "상품의 워크스페이스를 찾을 수 없습니다.");
  return row;
}
export async function productEvent(
  executor: Executor,
  actorId: string,
  productId: string,
  action: string,
  targetId: string,
  before: Record<string, unknown> = {},
  after: Record<string, unknown> = {},
) {
  const { randomUUID } = await import("node:crypto");
  await executor.execute({
    sql: "INSERT INTO product_events(id,product_id,actor_id,action,target_id,before_json,after_json) VALUES (?,?,?,?,?,?,?)",
    args: [
      randomUUID(),
      productId,
      actorId,
      action,
      targetId,
      JSON.stringify(before),
      JSON.stringify(after),
    ],
  });
}
