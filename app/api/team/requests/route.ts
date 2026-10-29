import { connection } from "next/server";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const owner = user.role === "owner";
    const result = await db().execute({
      sql: `SELECT r.id,r.status,r.requested_at,r.reviewed_at,u.name,w.name AS team_name FROM team_join_requests r JOIN users u ON u.id=r.user_id JOIN workspaces w ON w.id=r.workspace_id WHERE ${owner ? "r.workspace_id=? AND w.owner_id=?" : "r.user_id=?"} ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.requested_at DESC,r.id LIMIT 100`,
      args: owner ? [user.workspaceId, user.id] : [user.id],
    });
    const requests = result.rows.map((row) => ({
      id: String(row.id),
      status: String(row.status),
      name: String(row.name),
      teamName: String(row.team_name),
      requestedAt: String(row.requested_at),
    }));
    await audit(request, {
      user,
      action: "READ",
      resource: "team_join_requests",
      metadata: { returned: requests.length },
    });
    return Response.json(
      { requests },
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
    if (user.role !== "owner")
      throw new HttpError(403, "팀 owner만 가입 신청을 처리할 수 있습니다.");
    const data = await body(request);
    if (
      typeof data.id !== "string" ||
      data.id.length > 100 ||
      typeof data.status !== "string" ||
      !["approved", "rejected"].includes(data.status)
    )
      throw new HttpError(400, "처리할 신청과 승인 여부를 확인해 주세요.");
    const tx = await db().transaction("write");
    try {
      const result = await tx.execute({
        sql: "SELECT r.user_id,r.status FROM team_join_requests r JOIN workspaces w ON w.id=r.workspace_id JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? AND m.role='owner' WHERE r.id=? AND r.workspace_id=? AND w.owner_id=?",
        args: [user.id, data.id, user.workspaceId, user.id],
      });
      const row = result.rows[0];
      if (!row) throw new HttpError(404, "가입 신청을 찾을 수 없습니다.");
      if (row.status !== "pending")
        throw new HttpError(409, "이미 처리된 가입 신청입니다.");
      const memberId = String(row.user_id);
      if (data.status === "approved") {
        const account = await tx.execute({
          sql: "SELECT account_role,onboarding_complete FROM users WHERE id=?",
          args: [memberId],
        });
        if (
          account.rows[0]?.account_role !== "user" ||
          Number(account.rows[0]?.onboarding_complete) !== 1
        )
          throw new HttpError(409, "승인 가능한 user 계정이 아닙니다.");
        await tx.execute({
          sql: "INSERT INTO workspace_members(workspace_id,user_id,role,join_source) VALUES (?,?,'member','application') ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=CASE WHEN workspace_members.role='viewer' THEN 'member' ELSE workspace_members.role END,join_source='application'",
          args: [user.workspaceId, memberId],
        });
        const shared = await tx.execute({
          sql: "INSERT OR IGNORE INTO project_members(project_id,workspace_id,user_id,role) SELECT id,workspace_id,?,'member' FROM projects WHERE workspace_id=?",
          args: [memberId, user.workspaceId],
        });
        await tx.execute({
          sql: "UPDATE project_members SET role='member' WHERE workspace_id=? AND user_id=? AND role='viewer'",
          args: [user.workspaceId, memberId],
        });
        await tx.execute({
          sql: "UPDATE users SET active_workspace_id=?,updated_at=? WHERE id=?",
          args: [user.workspaceId, new Date().toISOString(), memberId],
        });
        await tx.execute({
          sql: "UPDATE sessions SET workspace_id=? WHERE user_id=? AND revoked_at IS NULL",
          args: [user.workspaceId, memberId],
        });
        await audit(
          request,
          {
            user,
            action: "CREATE",
            resource: "workspace_member",
            resourceId: memberId,
            after: { role: "member" },
            metadata: { sharedProjects: shared.rowsAffected },
          },
          tx,
        );
      }
      await tx.execute({
        sql: "UPDATE team_join_requests SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?",
        args: [String(data.status), user.id, new Date().toISOString(), data.id],
      });
      await audit(
        request,
        {
          user,
          action: "UPDATE",
          resource: "team_join_request",
          resourceId: data.id,
          before: { status: "pending" },
          after: { status: data.status },
          metadata: { memberId },
        },
        tx,
      );
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
