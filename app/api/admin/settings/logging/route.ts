import { randomUUID } from "node:crypto";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/plans";
import { getAppSetting } from "@/lib/settings";
import { db } from "@/lib/db";
import { noStore } from "@/lib/admin-query";
export async function GET() {
  try {
    requirePlatformAdmin(await requireUser());
    return Response.json(await getAppSetting("DB_LOGGING_ENABLED"), noStore);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requirePlatformAdmin(user);
    const input = await body(request);
    if (
      Object.keys(input).some((k) => !["value", "version"].includes(k)) ||
      typeof input.value !== "boolean" ||
      !Number.isSafeInteger(input.version)
    )
      throw new HttpError(400, "boolean 값과 버전이 필요합니다.");
    const tx = await db().transaction("write");
    try {
      const current = await getAppSetting("DB_LOGGING_ENABLED", tx);
      if (!current) throw new HttpError(404, "설정이 없습니다.");
      if (current.version !== input.version)
        throw new HttpError(
          409,
          "다른 관리자가 변경했습니다. 새로고침해 주세요.",
        );
      await tx.execute({
        sql: "UPDATE app_settings SET value_json=?,version=version+1,updated_by=?,updated_at=? WHERE setting_key='DB_LOGGING_ENABLED'",
        args: [JSON.stringify(input.value), user.id, new Date().toISOString()],
      });
      await tx.execute({
        sql: "INSERT INTO admin_setting_changes(id,actor_id,actor_name,setting_key,before_value,after_value,request_id) VALUES (?,?,?,'DB_LOGGING_ENABLED',?,?,?)",
        args: [
          randomUUID(),
          user.id,
          user.name,
          current.value ? 1 : 0,
          input.value ? 1 : 0,
          randomUUID(),
        ],
      });
      await tx.commit();
      return Response.json(await getAppSetting("DB_LOGGING_ENABLED"), noStore);
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
  } catch (e) {
    return errorResponse(e);
  }
}
