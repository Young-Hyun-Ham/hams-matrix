import "server-only";
import { randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import { db } from "./db";
import {
  HttpError,
  hashPassword,
  passwordInput,
  emailInput,
  newUserStatements,
} from "./auth";
import type { User } from "./types";
import {
  productAdminScope,
  productById,
  productEvent,
  type Executor,
} from "./product-access";

export function textInput(value: unknown, label: string, max = 100) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new HttpError(400, `${label}을(를) 1~${max}자로 입력해 주세요.`);
  return value.trim();
}
export function requireVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new HttpError(400, "현재 버전이 필요합니다.");
  return Number(value);
}
export async function writeTransaction<T>(fn: (tx: Transaction) => Promise<T>) {
  const tx = await db().transaction("write");
  try {
    const value = await fn(tx);
    await tx.commit();
    return value;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
export async function createProduct(
  tx: Executor,
  actorId: string,
  name: string,
  code: "team" | "business",
  endsAt: string | null = null,
) {
  const id = randomUUID();
  await tx.execute({
    sql: "INSERT INTO plan_products(id,product_code,name,plan_code,created_by) VALUES (?,?,?,?,?)",
    args: [id, `${code}-${id}`, name, code, actorId],
  });
  const contractId = randomUUID();
  await tx.execute({
    sql: "INSERT INTO contracts(id,product_id,member_limit,starts_at,ends_at,created_by) VALUES (?,?,?,?,?,?)",
    args: [
      contractId,
      id,
      code === "team" ? 20 : null,
      new Date().toISOString(),
      endsAt,
      actorId,
    ],
  });
  await productEvent(
    tx,
    actorId,
    id,
    "product_created",
    id,
    {},
    { name, plan: code },
  );
  return { id, contractId };
}
export async function requireSeat(tx: Executor, productId: string) {
  const product = await productById(productId, tx);
  const count = Number(
    (
      await tx.execute({
        sql: "SELECT count(*) AS n FROM product_members WHERE product_id=? AND status='active'",
        args: [productId],
      })
    ).rows[0].n,
  );
  if (product.member_limit !== null && count >= product.member_limit)
    throw new HttpError(
      409,
      "Team 상품은 관리자를 포함하여 20명까지 이용할 수 있습니다.",
      { code: "PRODUCT_SEAT_LIMIT" },
    );
  return product;
}
export async function grantMember(
  tx: Executor,
  actorId: string,
  productId: string,
  userId: string,
  role: "admin" | "member",
) {
  const product = await productById(productId, tx);
  const existing = (
    await tx.execute({
      sql: "SELECT product_id,status,role FROM product_members WHERE user_id=? AND status='active'",
      args: [userId],
    })
  ).rows[0];
  if (existing) {
    if (existing.product_id === productId && existing.role === role) return;
    throw new HttpError(
      409,
      "이미 다른 상품 또는 관리 권한에 소속된 계정입니다.",
    );
  }
  await requireSeat(tx, productId);
  const account = (
    await tx.execute({
      sql: "SELECT u.account_role,s.plan_code FROM users u JOIN user_subscriptions s ON s.user_id=u.id WHERE u.id=? AND u.onboarding_complete=1",
      args: [userId],
    })
  ).rows[0];
  if (!account || (role === "member" && account.account_role !== "user"))
    throw new HttpError(403, "일반 회원만 상품 지원을 받을 수 있습니다.");
  if (
    role === "admin" &&
    ![
      "user",
      product.plan_code === "business" ? "biz_admin" : "team_admin",
    ].includes(String(account.account_role))
  )
    throw new HttpError(403, "보호된 계정 역할은 변경할 수 없습니다.");
  if (role === "admin" && product.admin_limit !== null) {
    const count = Number(
      (
        await tx.execute({
          sql: "SELECT count(*) AS n FROM product_members WHERE product_id=? AND role='admin' AND status='active'",
          args: [productId],
        })
      ).rows[0].n,
    );
    if (count >= product.admin_limit)
      throw new HttpError(409, "이 상품의 관리자 정원을 초과합니다.");
  }
  await tx.execute({
    sql: "INSERT INTO product_members(product_id,user_id,role,previous_plan,granted_by) VALUES (?,?,?,?,?) ON CONFLICT(product_id,user_id) DO UPDATE SET role=excluded.role,status='active',previous_plan=excluded.previous_plan,granted_by=excluded.granted_by,version=product_members.version+1,granted_at=excluded.granted_at,revoked_at=NULL",
    args: [productId, userId, role, String(account.plan_code), actorId],
  });
  await tx.execute({
    sql: "UPDATE user_subscriptions SET plan_code=?,product_id=?,billing_cycle='contract',updated_by=?,updated_at=? WHERE user_id=?",
    args: [
      product.plan_code,
      productId,
      actorId,
      new Date().toISOString(),
      userId,
    ],
  });
  await tx.execute({
    sql: "UPDATE users SET account_role=CASE WHEN ?='admin' THEN ? ELSE account_role END,management_version=management_version+1 WHERE id=?",
    args: [
      role,
      product.plan_code === "business" ? "biz_admin" : "team_admin",
      userId,
    ],
  });
  await productEvent(
    tx,
    actorId,
    productId,
    role === "admin" ? "admin_created" : "member_granted",
    userId,
  );
}
export async function createBusinessAdmin(
  actor: User,
  productId: string,
  input: Record<string, unknown>,
) {
  if (actor.accountRole !== "master")
    throw new HttpError(403, "슈퍼관리자만 계정을 만들 수 있습니다.");
  const name = textInput(input.name, "이름", 80),
    email = emailInput(input.email);
  const password = await hashPassword(passwordInput(input.password));
  return writeTransaction(async (tx) => {
    const product = await productAdminScope(actor, productId, tx, true);
    if (product.plan_code !== "business")
      throw new HttpError(400, "Business 상품만 계정을 생성할 수 있습니다.");
    if (
      (
        await tx.execute({
          sql: "SELECT id FROM users WHERE email=?",
          args: [email],
        })
      ).rows.length
    )
      throw new HttpError(
        409,
        "이미 가입한 이메일입니다. 기존 계정은 덮어쓰지 않습니다.",
      );
    const id = randomUUID(),
      workspaceId = randomUUID();
    for (const statement of newUserStatements(
      id,
      workspaceId,
      name,
      email,
      password,
      { role: "user", plan: "free", teamId: null },
    ))
      await tx.execute(statement);
    await grantMember(tx, actor.id, productId, id, "admin");
    // Keep the initial personal workspace Free. A new business workspace captures the product.
    return { id, name, email };
  });
}
export async function changeProductMember(
  actor: User,
  productId: string,
  input: Record<string, unknown>,
  superMode = false,
) {
  const target = textInput(input.userId, "회원 ID");
  if (
    !["grant", "revoke"].includes(String(input.action)) ||
    Object.keys(input).some((k) => !["userId", "action", "version"].includes(k))
  )
    throw new HttpError(400, "회원 지원 요청을 확인해 주세요.");
  return writeTransaction(async (tx) => {
    await productAdminScope(actor, productId, tx, superMode);
    const user = (
      await tx.execute({
        sql: "SELECT id,account_role,management_version FROM users WHERE id=?",
        args: [target],
      })
    ).rows[0];
    if (!user || user.account_role !== "user")
      throw new HttpError(404, "지원할 수 있는 일반 회원을 찾을 수 없습니다.");
    if (Number(user.management_version) !== requireVersion(input.version))
      throw new HttpError(
        409,
        "회원 정보가 변경되었습니다. 다시 조회해 주세요.",
      );
    if (input.action === "grant") {
      await grantMember(tx, actor.id, productId, target, "member");
      return;
    }
    const member = (
      await tx.execute({
        sql: "SELECT previous_plan FROM product_members WHERE product_id=? AND user_id=? AND role='member' AND status='active'",
        args: [productId, target],
      })
    ).rows[0];
    if (!member) throw new HttpError(404, "상품 회원을 찾을 수 없습니다.");
    if (
      (
        await tx.execute({
          sql: "SELECT p.id FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.owner_id=? AND w.product_id=? LIMIT 1",
          args: [target, productId],
        })
      ).rows.length
    )
      throw new HttpError(
        409,
        "소유한 프로젝트가 있어 지원을 회수할 수 없습니다. 프로젝트 양도는 허용되지 않습니다.",
      );
    await tx.execute({
      sql: "UPDATE product_members SET status='revoked',version=version+1,revoked_at=? WHERE product_id=? AND user_id=?",
      args: [new Date().toISOString(), productId, target],
    });
    await tx.execute({
      sql: "UPDATE user_subscriptions SET plan_code=?,product_id=NULL,billing_cycle='monthly',updated_by=?,updated_at=? WHERE user_id=? AND product_id=?",
      args: [
        String(member.previous_plan),
        actor.id,
        new Date().toISOString(),
        target,
        productId,
      ],
    });
    await tx.execute({
      sql: "UPDATE users SET management_version=management_version+1 WHERE id=?",
      args: [target],
    });
    await productEvent(tx, actor.id, productId, "member_revoked", target);
  });
}
