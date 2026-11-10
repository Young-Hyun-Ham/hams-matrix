import "server-only";
import { db } from "./db";
import { body, checkOrigin, errorResponse, HttpError } from "./auth";
import { requireSuperAdmin, productById, productEvent } from "./product-access";
import {
  createProduct,
  createBusinessAdmin,
  requireVersion,
  textInput,
  writeTransaction,
} from "./plan-products";
import { updateBusinessRequest } from "./business-requests";
import { handleProductAdmin } from "./product-admin-api";

export async function handleSuperAdmin(request: Request, segments: string[]) {
  try {
    const user = await requireSuperAdmin();
    if (request.method !== "GET") checkOrigin(request);
    if (segments[0] === "notifications") {
      if (request.method === "GET") {
        const entries = (
          await db().execute({
            sql: "SELECT n.id,n.read_at,n.created_at,r.id AS requestId,r.company_name,u.name AS applicantName FROM notifications n JOIN business_requests r ON r.id=n.business_request_id JOIN users u ON u.id=r.user_id WHERE n.recipient_user_id=? AND r.status!='rejected' AND r.status!='approved' ORDER BY n.created_at DESC LIMIT 100",
            args: [user.id],
          })
        ).rows;
        const unread = Number(
          (
            await db().execute({
              sql: "SELECT count(*) AS n FROM notifications n JOIN business_requests r ON r.id=n.business_request_id WHERE n.recipient_user_id=? AND n.read_at IS NULL AND r.status!='rejected' AND r.status!='approved'",
              args: [user.id],
            })
          ).rows[0].n,
        );
        return Response.json(
          { notifications: entries, unread },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (request.method === "PATCH" && segments[1]) {
        const result = await db().execute({
          sql: "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_user_id=?",
          args: [new Date().toISOString(), segments[1], user.id],
        });
        if (!result.rowsAffected)
          throw new HttpError(404, "알림을 찾을 수 없습니다.");
        return Response.json({ ok: true });
      }
    }
    if (segments[0] === "business" && segments[1] === "requests") {
      if (request.method === "GET") {
        const entries = (
          await db().execute({
            sql: "SELECT r.*,u.name AS applicantName,u.email FROM business_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200",
          })
        ).rows;
        return Response.json({ requests: entries });
      }
      if (request.method === "PATCH" && segments[2]) {
        await updateBusinessRequest(user, segments[2], await body(request));
        return Response.json({ ok: true });
      }
    }
    if (
      ["business", "team"].includes(segments[0]) &&
      segments[1] === "products"
    ) {
      const code = segments[0] as "team" | "business",
        id = segments[2];
      if (!id && request.method === "GET") {
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
        return Response.json(
          { products, legacyWorkspaces },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (!id && request.method === "POST" && code === "business") {
        const input = await body(request),
          name = textInput(input.name, "상품명");
        return Response.json(
          await writeTransaction((tx) =>
            createProduct(tx, user.id, name, "business"),
          ),
          { status: 201 },
        );
      }
      if (id) {
        const type = (
          await db().execute({
            sql: "SELECT plan_code FROM plan_products WHERE id=?",
            args: [id],
          })
        ).rows[0];
        if (type?.plan_code !== code)
          throw new HttpError(404, "상품을 찾을 수 없습니다.");
        if (
          segments[3] === "admins" &&
          request.method === "POST" &&
          code === "business"
        )
          return Response.json(
            {
              member: await createBusinessAdmin(user, id, await body(request)),
            },
            { status: 201 },
          );
        if (segments[3] === "mapping" && request.method === "POST") {
          const input = await body(request);
          await writeTransaction(async (tx) => {
            const product = await productById(id, tx);
            const row = (
              await tx.execute({
                sql: "SELECT w.id FROM workspaces w JOIN product_members m ON m.user_id=w.owner_id AND m.product_id=? AND m.status='active' JOIN user_subscriptions s ON s.user_id=w.owner_id AND s.product_id=m.product_id WHERE w.id=? AND w.product_id IS NULL AND w.plan=?",
                args: [id, String(input.workspaceId ?? ""), product.plan_code],
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
          return Response.json({ ok: true });
        }
        if (segments.length === 3 && request.method === "PATCH") {
          const input = await body(request);
          if (
            !["active", "suspended", "expired"].includes(String(input.status))
          )
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
          return Response.json({ ok: true });
        }
        return handleProductAdmin(request, [id, ...segments.slice(3)], true);
      }
    }
    throw new HttpError(404, "슈퍼관리자 항목을 찾을 수 없습니다.");
  } catch (error) {
    return errorResponse(error);
  }
}
