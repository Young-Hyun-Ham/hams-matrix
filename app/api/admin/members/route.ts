import { randomUUID } from "node:crypto";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/plans";
import { paging, searchValue, noStore } from "@/lib/admin-query";
export async function GET(request: Request) {
  try {
    requirePlatformAdmin(await requireUser());
    const url = new URL(request.url);
    const { page: requested, pageSize } = paging(url);
    const q = searchValue(url),
      role = url.searchParams.get("role") ?? "",
      plan = url.searchParams.get("plan") ?? "";
    if (
      (role && !["master", "admin", "user", "guest"].includes(role)) ||
      (plan && !["free", "plus", "pro", "business"].includes(plan))
    )
      throw new HttpError(400, "필터를 확인해 주세요.");
    const where =
      " WHERE (u.name LIKE ? ESCAPE '\\' OR COALESCE(u.email,'') LIKE ? ESCAPE '\\' OR u.id LIKE ? ESCAPE '\\') AND (?='' OR u.account_role=?) AND (?='' OR s.plan_code=?)";
    const args = [q, q, q, role, role, plan, plan];
    const tx = await db().transaction("read");
    try {
      const total = Number(
        (
          await tx.execute({
            sql:
              "SELECT COUNT(*) AS n FROM users u LEFT JOIN user_subscriptions s ON s.user_id=u.id" +
              where,
            args,
          })
        ).rows[0].n,
      );
      const page = Math.min(
        requested,
        Math.max(1, Math.ceil(total / pageSize)),
      );
      const members = (
        await tx.execute({
          sql:
            "SELECT u.id,u.name,u.email,u.account_role AS accountRole,u.created_at AS createdAt,u.management_version AS version,s.plan_code AS plan FROM users u LEFT JOIN user_subscriptions s ON s.user_id=u.id" +
            where +
            " ORDER BY u.created_at DESC,u.id DESC LIMIT ? OFFSET ?",
          args: [...args, pageSize, (page - 1) * pageSize],
        })
      ).rows;
      await tx.commit();
      return Response.json({ members, total, page, pageSize }, noStore);
    } finally {
      tx.close();
    }
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
    if (!Number.isSafeInteger(input.version) || Number(input.version) < 1)
      throw new HttpError(400, "관리 버전이 필요합니다.");
    if (
      Object.keys(input).some(
        (k) => !["userId", "plan", "accountRole", "version"].includes(k),
      ) ||
      typeof input.userId !== "string" ||
      (input.plan === undefined && input.accountRole === undefined) ||
      (input.plan !== undefined &&
        !["free", "plus", "pro", "business"].includes(String(input.plan)))
    )
      throw new HttpError(400, "회원과 플랜을 확인해 주세요.");
    const tx = await db().transaction("write");
    try {
      const row = (
        await tx.execute({
          sql: "SELECT u.account_role,u.management_version,s.plan_code FROM users u JOIN user_subscriptions s ON s.user_id=u.id WHERE u.id=?",
          args: [input.userId],
        })
      ).rows[0];
      if (!row) throw new HttpError(404, "회원을 찾을 수 없습니다.");
      if (Number(row.management_version) !== input.version)
        throw new HttpError(
          409,
          "회원 정보가 변경되었습니다. 상세를 다시 열어 주세요.",
        );
      if (
        input.accountRole !== undefined &&
        input.accountRole !== row.account_role
      ) {
        if (
          user.accountRole !== "master" ||
          row.account_role === "master" ||
          !["admin", "user", "guest"].includes(String(input.accountRole))
        )
          throw new HttpError(
            403,
            "master만 일반 회원의 계정 역할을 변경할 수 있습니다.",
          );
        await tx.execute({
          sql: "UPDATE users SET account_role=? WHERE id=?",
          args: [String(input.accountRole), input.userId],
        });
        await tx.execute({
          sql: "UPDATE sessions SET revoked_at=? WHERE user_id=?",
          args: [new Date().toISOString(), input.userId],
        });
      }
      if (input.plan !== undefined && input.plan !== row.plan_code)
        await tx.execute({
          sql: "UPDATE user_subscriptions SET plan_code=?,billing_cycle=?,updated_by=?,updated_at=? WHERE user_id=?",
          args: [
            String(input.plan),
            input.plan === "business" ? "contract" : "monthly",
            user.id,
            new Date().toISOString(),
            input.userId,
          ],
        });
      await tx.execute({
        sql: "INSERT INTO plan_change_logs(id,actor_id,actor_name,resource,resource_id,before_json,after_json) VALUES (?,?,?,?,?,?,?)",
        args: [
          randomUUID(),
          user.id,
          user.name,
          "subscription",
          input.userId,
          JSON.stringify({
            plan: row.plan_code,
            accountRole: row.account_role,
          }),
          JSON.stringify({
            plan: input.plan ?? row.plan_code,
            accountRole: input.accountRole ?? row.account_role,
          }),
        ],
      });
      await tx.execute({
        sql: "UPDATE users SET management_version=management_version+1 WHERE id=?",
        args: [input.userId],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
