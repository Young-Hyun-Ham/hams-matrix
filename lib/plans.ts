import "server-only";
import type { Client, Row } from "@libsql/client";
import { db } from "./db";
import { HttpError } from "./auth";
import { isPlatformAdmin, type Plan } from "./plan-types";
import type { User } from "./types";
type Executor = Pick<Client, "execute">;
export function toPlan(row: Row): Plan {
  const nullable = (key: string) =>
    row[key] == null ? null : Number(row[key]);
  return {
    code: String(row.code) as Plan["code"],
    name: String(row.name),
    priceMode: row.price_mode === "contact" ? "contact" : "fixed",
    monthlyPrice: nullable("monthly_price"),
    yearlyPrice: nullable("yearly_price"),
    monthlyDiscountPrice: nullable("monthly_discount_price"),
    yearlyDiscountPrice: nullable("yearly_discount_price"),
    projectLimit: nullable("project_limit"),
    tokenLimit: nullable("token_limit"),
    dailyImageLimit: nullable("daily_image_limit"),
    attachmentLimit: Number(row.attachment_limit),
    historyEnabled: Number(row.history_enabled) === 1,
    recommended: Number(row.recommended) === 1,
    version: Number(row.version),
  };
}
export async function listPlans(executor: Executor = db()) {
  return (
    await executor.execute(
      "SELECT * FROM plans ORDER BY CASE code WHEN 'free' THEN 0 WHEN 'plus' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END",
    )
  ).rows.map(toPlan);
}
export async function memberPlan(userId: string, executor: Executor = db()) {
  const row = (
    await executor.execute({
      sql: "SELECT p.* FROM user_subscriptions s JOIN plans p ON p.code=s.plan_code WHERE s.user_id=?",
      args: [userId],
    })
  ).rows[0];
  if (!row) throw new HttpError(503, "회원 요금제 정보를 확인할 수 없습니다.");
  return toPlan(row);
}
export function requirePlatformAdmin(user: User) {
  if (!isPlatformAdmin(user.accountRole))
    throw new HttpError(403, "서비스 관리자만 이용할 수 있습니다.");
}
export async function assertProjectCapacity(
  userId: string,
  executor: Executor = db(),
) {
  const plan = await memberPlan(userId, executor);
  const count = Number(
    (
      await executor.execute({
        sql: "SELECT count(*) AS count FROM projects WHERE owner_id=?",
        args: [userId],
      })
    ).rows[0].count,
  );
  if (plan.projectLimit !== null && count >= plan.projectLimit)
    throw new HttpError(
      403,
      `${plan.name} 플랜은 프로젝트를 ${plan.projectLimit}개까지 보유할 수 있습니다.`,
    );
}
export async function projectHistoryEnabled(
  projectId: string,
  executor: Executor = db(),
) {
  const row = (
    await executor.execute({
      sql: "SELECT p.history_enabled FROM projects pr JOIN user_subscriptions s ON s.user_id=pr.owner_id JOIN plans p ON p.code=s.plan_code WHERE pr.id=?",
      args: [projectId],
    })
  ).rows[0];
  return Number(row?.history_enabled) === 1;
}
