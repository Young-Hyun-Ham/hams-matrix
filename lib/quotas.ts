import "server-only";
import type { Transaction } from "@libsql/client";
import { db } from "./db";
import { HttpError } from "./auth";
import { memberPlan } from "./plans";
export const quotaPeriod = (resource: "tokens" | "images", now = new Date()) => resource === "tokens" ? "lifetime" : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
// No automatic token resets until a replenishment policy is specified.
export async function reserveQuota(userId: string, id: string, resource: "tokens" | "images", amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new HttpError(400, "사용량 예약값이 올바르지 않습니다.");
  const tx = await db().transaction("write");
  try {
    const plan = await memberPlan(userId, tx);
    const period = quotaPeriod(resource);
    const existing = (await tx.execute({ sql: "SELECT id FROM quota_reservations WHERE id=?", args: [id] })).rows[0];
    if (existing) throw new HttpError(409, "이미 처리한 사용량 요청입니다.");
    const used = Number((await tx.execute({ sql: "SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual WHEN status='reserved' THEN reserved ELSE 0 END),0) AS used FROM quota_reservations WHERE user_id=? AND resource=? AND period=?", args: [userId, resource, period] })).rows[0].used);
    const limit = resource === "tokens" ? plan.tokenLimit : plan.dailyImageLimit;
    if (limit !== null && used + amount > limit) throw new HttpError(403, resource === "tokens" ? "요금제의 AI 토큰이 부족합니다. 사용량 또는 플랜을 확인해 주세요." : "오늘의 이미지 생성 한도를 모두 사용했습니다.");
    await tx.execute({ sql: "INSERT INTO quota_reservations(id,user_id,resource,period,reserved,policy_version) VALUES (?,?,?,?,?,?)", args: [id,userId,resource,period,amount,plan.version] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; } finally { tx.close(); }
}
export async function settleQuota(id: string, actual: number, executor?: Pick<Transaction, "execute">) {
  if (!Number.isSafeInteger(actual) || actual < 0) throw new Error("Invalid actual quota");
  await (executor ?? db()).execute({ sql: "UPDATE quota_reservations SET actual=?,status='settled' WHERE id=? AND status!='released'", args: [actual,id] });
}
export async function releaseQuota(id: string) {
  await db().execute({ sql: "UPDATE quota_reservations SET actual=0,status='released' WHERE id=? AND status='reserved'", args: [id] });
}
export async function quotaUsage(userId: string) {
  const result: Record<string, number> = {};
  for (const resource of ["tokens", "images"] as const) {
    result[resource] = Number((await db().execute({ sql: "SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual WHEN status='reserved' THEN reserved ELSE 0 END),0) AS used FROM quota_reservations WHERE user_id=? AND resource=? AND period=?", args: [userId,resource,quotaPeriod(resource)] })).rows[0].used);
  }
  result.projects = Number((await db().execute({ sql: "SELECT count(*) AS count FROM projects WHERE owner_id=?", args: [userId] })).rows[0].count);
  return result;
}
