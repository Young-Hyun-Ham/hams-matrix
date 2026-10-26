import { requireUser, errorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { connection } from "next/server";
export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    // Account activity is scoped to the current actor AND current workspace, regardless of role.
    const result = await db().execute({
      sql: "SELECT id,occurred_at,actor_name,action,resource_type,outcome,changed_fields_json,before_json,after_json FROM audit_logs WHERE workspace_id=? AND actor_id=? ORDER BY occurred_at DESC,id DESC LIMIT 50",
      args: [user.workspaceId, user.id],
    });
    await audit(request, {
      user,
      action: "READ",
      resource: "audit_logs",
      metadata: { limit: 50, returned: result.rows.length },
    });
    return Response.json(
      { events: result.rows },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
