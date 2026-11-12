import "server-only";
import { db } from "./db";
import { HttpError } from "./auth";
import { productById, productEvent } from "./product-access";
import { requireVersion, writeTransaction } from "./plan-products";
import type { User } from "./types";

export async function getSuperAdminNotificationCount(user: User) {
  const unread = Number(
    (
      await db().execute({
        sql: "SELECT count(*) AS n FROM notifications n JOIN business_requests r ON r.id=n.business_request_id WHERE n.recipient_user_id=? AND n.read_at IS NULL AND r.status!='rejected' AND r.status!='approved'",
        args: [user.id],
      })
    ).rows[0].n,
  );

  return unread;
}

export async function listSuperAdminNotifications(user: User) {
  const entries = (
    await db().execute({
      sql: "SELECT n.id,n.read_at,n.created_at,r.id AS requestId,r.company_name,u.name AS applicantName FROM notifications n JOIN business_requests r ON r.id=n.business_request_id JOIN users u ON u.id=r.user_id WHERE n.recipient_user_id=? AND r.status!='rejected' AND r.status!='approved' ORDER BY n.created_at DESC LIMIT 100",
      args: [user.id],
    })
  ).rows;

  return entries;
}

export async function markSuperAdminNotificationRead(
  user: User,
  notificationId: string,
) {
  const result = await db().execute({
    sql: "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_user_id=?",
    args: [new Date().toISOString(), notificationId, user.id],
  });
  if (!result.rowsAffected)
    throw new HttpError(404, "알림을 찾을 수 없습니다.");
}

export async function listBusinessRequests() {
  const entries = (
    await db().execute({
      sql: "SELECT r.*,u.name AS applicantName,u.email FROM business_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200",
    })
  ).rows;

  return entries;
}

export async function listAdminProducts(code: "team" | "business") {
  const products = (
    await db().execute({
      sql: "SELECT p.*,c.id AS contractId,c.member_limit,c.admin_limit,c.ends_at,c.version AS contractVersion,(SELECT count(*) FROM product_members m WHERE m.product_id=p.id AND m.status='active') AS used FROM plan_products p LEFT JOIN contracts c ON c.product_id=p.id AND c.status='active' WHERE p.plan_code=? ORDER BY p.created_at DESC",
      args: [code],
    })
  ).rows;
  const legacyWorkspaces = (
    await db().execute({
      sql: "SELECT w.id,w.name,w.plan FROM workspaces w WHERE w.plan=? AND w.product_id IS NULL ORDER BY w.name",
      args: [code],
    })
  ).rows;

  return { products, legacyWorkspaces };
}

export async function mapProductWorkspace(
  user: User,
  id: string,
  workspaceId: string,
) {
  await writeTransaction(async (tx) => {
    const product = await productById(id, tx);
    const row = (
      await tx.execute({
        sql: "SELECT w.id FROM workspaces w JOIN product_members m ON m.user_id=w.owner_id AND m.product_id=? AND m.status='active' JOIN user_subscriptions s ON s.user_id=w.owner_id AND s.product_id=m.product_id WHERE w.id=? AND w.product_id IS NULL AND w.plan=?",
        args: [id, workspaceId, product.plan_code],
      })
    ).rows[0];
    if (!row)
      throw new HttpError(
        409,
        "소유자의 상품 소속과 기존 공간 플랜이 일치해야 연결할 수 있습니다.",
      );
    await tx.execute({
      sql: "UPDATE workspaces SET product_id=? WHERE id=? AND product_id IS NULL",
      args: [id, String(row.id)],
    });
    await productEvent(
      tx,
      user.id,
      id,
      "legacy_workspace_mapped",
      String(row.id),
    );
  });
}

export async function changeAdminProductStatus(
  user: User,
  id: string,
  input: Record<string, unknown>,
) {
  if (!["active", "suspended", "expired"].includes(String(input.status)))
    throw new HttpError(400, "상품 상태를 확인해 주세요.");
  await writeTransaction(async (tx) => {
    const result = await tx.execute({
      sql: "UPDATE plan_products SET status=?,version=version+1 WHERE id=? AND version=?",
      args: [String(input.status), id, requireVersion(input.version)],
    });
    if (!result.rowsAffected)
      throw new HttpError(409, "상품 정보가 변경되었습니다.");
    await productEvent(
      tx,
      user.id,
      id,
      "product_status_changed",
      id,
      {},
      { status: input.status },
    );
  });
}
