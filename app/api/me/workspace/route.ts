import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { auditStatements } from "@/lib/audit";
import {
  body,
  checkOrigin,
  digest,
  errorResponse,
  HttpError,
  requireUser,
  SESSION_COOKIE,
} from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET() {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const rows = await db().execute({
      sql: "SELECT w.id,w.name,w.plan FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.name,w.id",
      args: [user.id],
    });
    return Response.json(
      { workspaces: rows.rows, current: user.workspaceId, user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    // Creating another workspace is a recovery path after a subscription change.
    const user = await requireUser({ allowPlanMismatch: true });
    const input = await body(request);
    if (
      Object.keys(input).some((key) => key !== "name") ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.trim().length > 80
    )
      throw new HttpError(400, "워크스페이스 이름을 1~80자로 입력해 주세요.");
    const id = randomUUID();
    const name = input.name.trim();
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    const tx = await db().transaction("write");
    try {
      const subscription = (
        await tx.execute({
          sql: "SELECT plan_code FROM user_subscriptions WHERE user_id=?",
          args: [user.id],
        })
      ).rows[0];
      if (!subscription)
        throw new HttpError(503, "현재 요금제를 확인할 수 없습니다.");
      const plan = String(subscription.plan_code);
      await tx.execute({
        sql: "INSERT INTO workspaces(id,name,owner_id,plan,subscription_plan) VALUES (?,?,?,?,?)",
        args: [id, name, user.id, plan, plan],
      });
      await tx.execute({
        sql: "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,'owner')",
        args: [id, user.id],
      });
      await tx.execute({
        sql: "UPDATE users SET active_workspace_id=? WHERE id=?",
        args: [id, user.id],
      });
      await tx.execute({
        sql: "UPDATE sessions SET workspace_id=? WHERE token_hash=? AND user_id=? AND revoked_at IS NULL",
        args: [id, digest(token), user.id],
      });
      for (const statement of auditStatements(request, {
        user: {
          ...user,
          workspaceId: id,
          workspaceName: name,
          workspacePlan: plan,
          role: "owner",
        },
        action: "CREATE",
        resource: "workspace",
        resourceId: id,
        after: { name, plan },
      }))
        await tx.execute(statement);
      await tx.commit();
      return Response.json({ workspace: { id, name, plan } }, { status: 201 });
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
export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser({ allowPlanMismatch: true });
    const input = await body(request);
    if (typeof input.workspaceId !== "string")
      throw new HttpError(400, "워크스페이스를 선택해 주세요.");
    const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
    const tx = await db().transaction("write");
    try {
      if (
        !(
          await tx.execute({
            sql: "SELECT user_id FROM workspace_members WHERE workspace_id=? AND user_id=?",
            args: [input.workspaceId, user.id],
          })
        ).rows.length
      )
        throw new HttpError(403, "참여한 워크스페이스만 선택할 수 있습니다.");
      await tx.execute({
        sql: "UPDATE users SET active_workspace_id=? WHERE id=?",
        args: [input.workspaceId, user.id],
      });
      await tx.execute({
        sql: "UPDATE sessions SET workspace_id=? WHERE token_hash=? AND user_id=? AND revoked_at IS NULL",
        args: [input.workspaceId, digest(token), user.id],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
