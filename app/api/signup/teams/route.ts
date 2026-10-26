import { connection } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { errorResponse } from "@/lib/auth";

export async function GET(request: Request) {
  await connection();
  try {
    const query = (new URL(request.url).searchParams.get("q") ?? "")
      .trim()
      .slice(0, 100);
    const result = await db().execute({
      sql: `SELECT w.id,w.name FROM workspaces w JOIN users u ON u.id=w.owner_id JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=w.owner_id AND m.role='owner' WHERE u.account_role='owner' AND u.onboarding_complete=1 AND w.subscription_plan IN ('team','business') AND instr(lower(w.name),lower(?))>0 ORDER BY w.name,w.id LIMIT 30`,
      args: [query],
    });
    await audit(request, {
      action: "READ",
      resource: "team_directory",
      metadata: { returned: result.rows.length, limit: 30 },
    });
    return Response.json(
      {
        teams: result.rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
