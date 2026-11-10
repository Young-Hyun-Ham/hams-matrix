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
    const user = await requireUser({ allowPlanMismatch: true });
    const plan = await memberPlan(user.id);
    const projects = Number(
      (
        await db().execute({
          sql: "SELECT count(*) AS count FROM projects WHERE owner_id=? AND workspace_id=?",
          args: [user.id, user.workspaceId],
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
        workspacePlan: user.workspacePlan,
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
    const user = await requireUser({ allowPlanMismatch: true });
    if (user.accountRole === "guest")
      throw new HttpError(403, "게스트는 요금제를 변경할 수 없습니다.");
    const input = await body(request);
    const codes = ["free", "pro", "team", "business"];
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
    const isMaster = user.accountRole === "master";
    if (!isMaster && input.plan === "team")
      throw new HttpError(409, "Team은 결제 성공 확인 후 이용할 수 있습니다.", {
        code: "TEAM_PAYMENT_REQUIRED",
      });
    if (!isMaster && input.plan === "business")
      throw new HttpError(
        409,
        "Business 계약 신청을 통해 슈퍼관리자와 계약을 진행해 주세요.",
        {
          code: "BUSINESS_REQUEST_REQUIRED",
        },
      );
    const tx = await db().transaction("write");
    try {
      const support = (
        await tx.execute({
          sql: "SELECT product_id FROM user_subscriptions WHERE user_id=?",
          args: [user.id],
        })
      ).rows[0];
      if (support?.product_id)
        throw new HttpError(
          409,
          "상품 지원 중에는 개인 요금제를 변경할 수 없습니다. 상품 관리자에게 지원 종료를 요청해 주세요.",
        );
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
            JSON.stringify({
              plan: target.code,
              paymentMode: "none",
              ...(isMaster ? { changeMode: "master_direct" } : {}),
            }),
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
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED")
    )
      return errorResponse(
        new HttpError(
          409,
          "다른 요금제 변경이 처리 중입니다. 새로고침 후 다시 선택해 주세요.",
        ),
      );
    return errorResponse(error);
  }
}
