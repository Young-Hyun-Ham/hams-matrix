import { randomUUID } from "node:crypto";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { listPlans, requirePlatformAdmin, toPlan } from "@/lib/plans";
export async function GET() {
  try {
    requirePlatformAdmin(await requireUser());
    return Response.json(
      { plans: await listPlans() },
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
    requirePlatformAdmin(user);
    const input = await body(request);
    const numeric = [
      "monthlyPrice",
      "yearlyPrice",
      "projectLimit",
      "tokenLimit",
      "dailyImageLimit",
    ] as const;
    for (const key of numeric)
      if (
        input[key] !== null &&
        (typeof input[key] !== "number" ||
          !Number.isSafeInteger(input[key]) ||
          Number(input[key]) < 0)
      )
        throw new HttpError(
          400,
          "금액과 한도는 0 이상의 정수 또는 무제한/미정이어야 합니다.",
        );
    if (
      !Number.isInteger(input.attachmentLimit) ||
      Number(input.attachmentLimit) < 0 ||
      Number(input.attachmentLimit) > 5 ||
      typeof input.historyEnabled !== "boolean" ||
      typeof input.recommended !== "boolean" ||
      !["fixed", "contact"].includes(String(input.priceMode)) ||
      !Number.isInteger(input.version)
    )
      throw new HttpError(
        400,
        "플랜 설정을 확인해 주세요. 첨부 한도는 0~5개입니다.",
      );
    if (
      input.priceMode === "fixed" &&
      (input.monthlyPrice === null ||
        (input.yearlyPrice !== null &&
          Number(input.monthlyPrice) > 0 &&
          input.yearlyPrice === Number(input.monthlyPrice) * 12))
    )
      throw new HttpError(
        400,
        "월간 가격을 입력하고 연간 가격은 월간 12개월 합계와 다르게 설정해 주세요.",
      );
    const tx = await db().transaction("write");
    try {
      const row = (
        await tx.execute({
          sql: "SELECT * FROM plans WHERE code=?",
          args: [String(input.code)],
        })
      ).rows[0];
      if (!row) throw new HttpError(404, "플랜을 찾을 수 없습니다.");
      if (Number(row.version) !== input.version)
        throw new HttpError(
          409,
          "다른 관리자가 수정했습니다. 새로고침해 주세요.",
        );
      await tx.execute({
        sql: "UPDATE plans SET price_mode=?,monthly_price=?,yearly_price=?,project_limit=?,token_limit=?,daily_image_limit=?,attachment_limit=?,history_enabled=?,recommended=?,version=version+1,updated_by=?,updated_at=? WHERE code=?",
        args: [
          String(input.priceMode),
          ...numeric.map((key) => input[key] as number | null),
          Number(input.attachmentLimit),
          input.historyEnabled ? 1 : 0,
          input.recommended ? 1 : 0,
          user.id,
          new Date().toISOString(),
          String(input.code),
        ],
      });
      await tx.execute({
        sql: "INSERT INTO plan_change_logs(id,actor_id,actor_name,resource,resource_id,before_json,after_json) VALUES (?,?,?,?,?,?,?)",
        args: [
          randomUUID(),
          user.id,
          user.name,
          "plan",
          String(input.code),
          JSON.stringify(toPlan(row)),
          JSON.stringify(input),
        ],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
    return Response.json(
      { plans: await listPlans() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
