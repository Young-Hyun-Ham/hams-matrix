import { requireUser, errorResponse } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const result = await db().execute({
      sql: "SELECT u.id,u.name,m.role FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.name,u.id",
      args: [user.workspaceId],
    });
    const members = result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      role: String(row.role),
    }));
    await audit(request, {
      user,
      action: "READ",
      resource: "workspace_members",
      metadata: { returned: members.length },
    });
    return Response.json(
      { members },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
