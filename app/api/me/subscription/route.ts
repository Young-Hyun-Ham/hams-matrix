import { randomUUID } from "node:crypto";
import {
  body,
  checkOrigin,
  HttpError,
  errorResponse,
  requireUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { listPlans, memberPlan } from "@/lib/plans";
import { quotaPeriod } from "@/lib/quotas";
export async function GET() {
  try {
    const user = await requireUser();
    const plan = await memberPlan(user.id);
    const projects = Number(
      (
        await db().execute({
          sql: "SELECT count(*) AS count FROM projects WHERE owner_id=?",
          args: [user.id],
        })
      ).rows[0].count,
    );
    const usage: Record<string, number> = {};
    for (const resource of ["tokens", "images"] as const)
      usage[resource] = Number(
        (
          await db().execute({
            sql: "SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual WHEN status='reserved' THEN reserved ELSE 0 END),0) AS used FROM quota_reservations WHERE user_id=? AND resource=? AND period=?",
            args: [user.id, resource, quotaPeriod(resource)],
          })
        ).rows[0].used,
      );
    return Response.json(
      {
        plan,
        plans: await listPlans(),
        usage: { ...usage, projects },
        tokenPeriod: "total",
        imageTimezone: "Asia/Seoul",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.accountRole === "guest")
      throw new HttpError(403, "게스트는 요금제를 변경할 수 없습니다.");
    const input = await body(request);
    const codes = ["free", "plus", "pro", "business"];
    if (
      Object.keys(input).some(
        (key) => !["plan", "currentPlan", "planVersion"].includes(key),
      ) ||
      typeof input.plan !== "string" ||
      !codes.includes(input.plan) ||
      typeof input.currentPlan !== "string" ||
      !codes.includes(input.currentPlan) ||
      !Number.isSafeInteger(input.planVersion) ||
      Number(input.planVersion) < 1
    )
      throw new HttpError(400, "요금제 정보를 확인해 주세요.");
    const tx = await db().transaction("write");
    try {
      const current = await memberPlan(user.id, tx);
      const target = (await listPlans(tx)).find(
        (plan) => plan.code === input.plan,
      );
      if (!target) throw new HttpError(400, "요금제를 찾을 수 없습니다.");
      if (
        current.code !== input.currentPlan ||
        target.version !== input.planVersion
      )
        throw new HttpError(
          409,
          "요금제 정보가 변경되었습니다. 새로고침 후 다시 선택해 주세요.",
        );
      if (current.code !== target.code) {
        await tx.execute({
          sql: "UPDATE user_subscriptions SET plan_code=?,billing_cycle=?,updated_by=?,updated_at=? WHERE user_id=?",
          args: [
            target.code,
            target.code === "business" ? "contract" : "monthly",
            user.id,
            new Date().toISOString(),
            user.id,
          ],
        });
        await tx.execute({
          sql: "UPDATE users SET management_version=management_version+1 WHERE id=?",
          args: [user.id],
        });
        await tx.execute({
          sql: "INSERT INTO plan_change_logs(id,actor_id,actor_name,resource,resource_id,before_json,after_json) VALUES (?,?,?,?,?,?,?)",
          args: [
            randomUUID(),
            user.id,
            user.name,
            "subscription",
            user.id,
            JSON.stringify({ plan: current.code }),
            JSON.stringify({ plan: target.code, paymentMode: "none" }),
          ],
        });
      }
      await tx.commit();
      return Response.json(
        { ok: true, plan: target },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  } catch (error) {
    return errorResponse(error);
  }
}
