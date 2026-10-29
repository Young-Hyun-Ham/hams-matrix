import { cookies } from "next/headers";
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
    const user = await requireUser();
    const rows = await db().execute({
      sql: "SELECT w.id,w.name FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.name,w.id",
      args: [user.id],
    });
    return Response.json(
      { workspaces: rows.rows, current: user.workspaceId },
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
