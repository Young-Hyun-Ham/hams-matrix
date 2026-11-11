import { requireUser, errorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { noStore } from "@/lib/admin-query";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user.teamSharingEnabled) return Response.json({ unread: 0 }, noStore);
    const owner = user.role === "owner";
    const result = await db().execute({
      sql: `SELECT count(*) AS n FROM team_join_requests r JOIN workspaces w ON w.id=r.workspace_id WHERE r.status='pending' AND ${owner ? "r.workspace_id=? AND w.owner_id=?" : "r.user_id=?"}`,
      args: owner ? [user.workspaceId, user.id] : [user.id],
    });
    return Response.json({ unread: Number(result.rows[0].n) }, noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
