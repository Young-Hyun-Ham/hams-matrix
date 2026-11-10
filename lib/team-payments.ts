import "server-only";
import { randomUUID } from "node:crypto";
import { HttpError } from "./auth";
import type { User } from "./types";
import { listPlans } from "./plans";
import { createProduct, grantMember, writeTransaction } from "./plan-products";
import { productEvent } from "./product-access";

export type PaymentReceipt = {
  orderId: string;
  eventId: string;
  paymentId: string;
  userId: string;
  amount: number;
  currency: "KRW";
  status: "paid" | "cancelled" | "refunded";
};
export type TeamPaymentProvider = {
  name: string;
  createCheckout(order: {
    id: string;
    userId: string;
    amount: number;
    currency: "KRW";
  }): Promise<{ checkoutUrl: string }>;
  // Implementations must authenticate the provider and verify its server-side result.
  verify(request: Request): Promise<PaymentReceipt>;
};
let provider: TeamPaymentProvider | undefined;
// Server-only adapter registration. There is no HTTP endpoint or client flag to install an adapter.
export function registerTeamPaymentProvider(adapter: TeamPaymentProvider) {
  provider = adapter;
}
export function teamPaymentStatus() {
  return {
    configured: Boolean(provider),
    message: provider
      ? "Team 결제를 진행할 수 있습니다."
      : "Team 결제 서비스 준비 중입니다. 결제 연동 후 이용할 수 있습니다.",
  };
}
function paymentProvider() {
  if (!provider)
    throw new HttpError(503, teamPaymentStatus().message, {
      code: "PAYMENT_NOT_CONFIGURED",
    });
  return provider;
}
export async function createTeamOrder(
  user: User,
  input: Record<string, unknown>,
) {
  if (
    Object.keys(input).some(
      (k) => !["billingCycle", "productId"].includes(k),
    ) ||
    !["monthly", "yearly"].includes(String(input.billingCycle))
  )
    throw new HttpError(400, "결제 주기를 확인해 주세요.");
  const adapter = paymentProvider();
  const cycle = String(input.billingCycle),
    target = input.productId == null ? null : String(input.productId);
  if (!target && user.accountRole !== "user")
    throw new HttpError(
      403,
      "일반 사용자만 새 Team 상품을 구매할 수 있습니다.",
    );
  const plan = (await listPlans()).find((p) => p.code === "team")!;
  const amount =
    cycle === "yearly"
      ? (plan.yearlyDiscountPrice ?? plan.yearlyPrice)
      : (plan.monthlyDiscountPrice ?? plan.monthlyPrice);
  if (amount === null || amount <= 0 || plan.priceMode !== "fixed")
    throw new HttpError(409, "Team 결제 가격이 준비되지 않았습니다.");
  const order = await writeTransaction(async (tx) => {
    const actual = (
      await tx.execute({
        sql: "SELECT u.account_role,m.product_id FROM users u LEFT JOIN product_members m ON m.user_id=u.id AND m.status='active' WHERE u.id=?",
        args: [user.id],
      })
    ).rows[0];
    if (target) {
      const own = (
        await tx.execute({
          sql: "SELECT p.id FROM plan_products p JOIN product_members m ON m.product_id=p.id AND m.user_id=? AND m.role='admin' AND m.status='active' WHERE p.id=? AND p.plan_code='team' AND p.created_by=?",
          args: [user.id, target, user.id],
        })
      ).rows[0];
      if (!own || actual?.account_role !== "team_admin")
        throw new HttpError(
          403,
          "자신이 구매한 Team 상품만 갱신할 수 있습니다.",
        );
    } else if (actual?.account_role !== "user" || actual.product_id)
      throw new HttpError(
        409,
        "기존 상품 지원을 종료한 후 새 Team을 구매해 주세요.",
      );
    const pending = (
      await tx.execute({
        sql: "SELECT id,amount,product_id,billing_cycle FROM payment_orders WHERE user_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",
        args: [user.id],
      })
    ).rows[0];
    if (pending) {
      if (
        pending.product_id !== target ||
        Number(pending.amount) !== amount ||
        pending.billing_cycle !== cycle
      )
        throw new HttpError(
          409,
          "진행 중인 결제 주문을 먼저 완료하거나 취소해 주세요.",
        );
      return {
        id: String(pending.id),
        userId: user.id,
        amount,
        currency: "KRW" as const,
      };
    }
    const id = randomUUID();
    await tx.execute({
      sql: "INSERT INTO payment_orders(id,user_id,product_id,amount,plan_version,billing_cycle,provider) VALUES (?,?,?,?,?,?,?)",
      args: [id, user.id, target, amount, plan.version, cycle, adapter.name],
    });
    return { id, userId: user.id, amount, currency: "KRW" as const };
  });
  return { orderId: order.id, ...(await adapter.createCheckout(order)) };
}
export async function processTeamPayment(request: Request) {
  const adapter = paymentProvider(),
    receipt = await adapter.verify(request);
  if (
    !["paid", "cancelled", "refunded"].includes(receipt.status) ||
    !receipt.orderId ||
    !receipt.eventId ||
    !receipt.paymentId ||
    !Number.isSafeInteger(receipt.amount)
  )
    throw new HttpError(400, "결제 검증 결과가 올바르지 않습니다.");
  // Persist the verified provider result before fulfillment so a failed grant is retryable.
  await writeTransaction(async (tx) => {
    const order = (
      await tx.execute({
        sql: "SELECT * FROM payment_orders WHERE id=?",
        args: [receipt.orderId],
      })
    ).rows[0];
    if (
      !order ||
      order.provider !== adapter.name ||
      order.user_id !== receipt.userId ||
      Number(order.amount) !== receipt.amount ||
      order.currency !== receipt.currency
    )
      throw new HttpError(400, "결제 주문 정보가 일치하지 않습니다.");
    if (
      (
        await tx.execute({
          sql: "SELECT order_id,status FROM payment_events WHERE provider=? AND event_id=?",
          args: [adapter.name, receipt.eventId],
        })
      ).rows.some(
        (r) => r.order_id !== receipt.orderId || r.status !== receipt.status,
      )
    )
      throw new HttpError(409, "다른 주문의 결제 이벤트입니다.");
    await tx.execute({
      sql: "INSERT INTO payment_events(provider,event_id,order_id,status) VALUES (?,?,?,?) ON CONFLICT(provider,event_id) DO NOTHING",
      args: [adapter.name, receipt.eventId, receipt.orderId, receipt.status],
    });
    if (order.status === "refunded" || order.status === "cancelled") return;
    if (receipt.status === "cancelled" && order.status === "paid") return;
    await tx.execute({
      sql: "UPDATE payment_orders SET status=?,provider_payment_id=? WHERE id=?",
      args: [receipt.status, receipt.paymentId, receipt.orderId],
    });
  });
  return writeTransaction(async (tx) => {
    const order = (
      await tx.execute({
        sql: "SELECT * FROM payment_orders WHERE id=?",
        args: [receipt.orderId],
      })
    ).rows[0];
    if (order.status !== "paid") {
      if (order.status === "refunded" && order.product_id) {
        // Do not suspend an independently renewed product for an older refunded order.
        const latest = (
          await tx.execute({
            sql: "SELECT id FROM payment_orders WHERE product_id=? AND fulfilled_at IS NOT NULL ORDER BY fulfilled_at DESC,id DESC LIMIT 1",
            args: [order.product_id],
          })
        ).rows[0];
        if (latest?.id === order.id) {
          const suspended = await tx.execute({
            sql: "UPDATE plan_products SET status='suspended',version=version+1 WHERE id=? AND status='active'",
            args: [order.product_id],
          });
          if (suspended.rowsAffected)
            await productEvent(
              tx,
              receipt.userId,
              String(order.product_id),
              "payment_refunded",
              receipt.orderId,
            );
        }
      }
      return { status: String(order.status) };
    }
    if (order.fulfilled_at)
      return { status: "paid", productId: String(order.product_id) };
    const userId = String(order.user_id);
    let productId = order.product_id == null ? null : String(order.product_id);
    const endsAt = new Date();
    const activeContract = productId
      ? (
          await tx.execute({
            sql: "SELECT ends_at FROM contracts WHERE product_id=? AND status='active'",
            args: [productId],
          })
        ).rows[0]
      : undefined;
    if (
      activeContract?.ends_at &&
      new Date(String(activeContract.ends_at)) > endsAt
    )
      endsAt.setTime(new Date(String(activeContract.ends_at)).getTime());
    endsAt.setUTCMonth(
      endsAt.getUTCMonth() + (order.billing_cycle === "yearly" ? 12 : 1),
    );
    if (!productId) {
      const user = (
        await tx.execute({
          sql: "SELECT name,account_role FROM users WHERE id=?",
          args: [userId],
        })
      ).rows[0];
      if (user?.account_role !== "user")
        throw new HttpError(
          409,
          "계정 역할이 변경되어 결제 반영 확인이 필요합니다. 추가 결제하지 마세요.",
        );
      const created = await createProduct(
        tx,
        userId,
        `Team · ${user.name}`,
        "team",
        endsAt.toISOString(),
      );
      productId = created.id;
      await grantMember(tx, userId, productId, userId, "admin");
    } else {
      const owner = (
        await tx.execute({
          sql: "SELECT p.id FROM plan_products p JOIN product_members m ON m.product_id=p.id AND m.user_id=? AND m.role='admin' AND m.status='active' JOIN users u ON u.id=m.user_id WHERE p.id=? AND p.plan_code='team' AND p.created_by=? AND u.account_role='team_admin'",
          args: [userId, productId, userId],
        })
      ).rows[0];
      if (!owner)
        throw new HttpError(
          409,
          "상품 관리자 상태가 변경되어 결제 반영 확인이 필요합니다.",
        );
      await tx.execute({
        sql: "UPDATE plan_products SET status='active',version=version+1 WHERE id=?",
        args: [productId],
      });
      await tx.execute({
        sql: "UPDATE contracts SET status='expired' WHERE product_id=? AND status='active'",
        args: [productId],
      });
      await tx.execute({
        sql: "INSERT INTO contracts(id,product_id,member_limit,starts_at,ends_at,created_by) VALUES (?,?,20,?,?,?)",
        args: [
          randomUUID(),
          productId,
          new Date().toISOString(),
          endsAt.toISOString(),
          userId,
        ],
      });
    }
    await tx.execute({
      sql: "UPDATE payment_orders SET product_id=?,fulfilled_at=? WHERE id=?",
      args: [productId, new Date().toISOString(), receipt.orderId],
    });
    await productEvent(
      tx,
      userId,
      productId,
      "payment_fulfilled",
      receipt.orderId,
    );
    return { status: "paid", productId };
  });
}
