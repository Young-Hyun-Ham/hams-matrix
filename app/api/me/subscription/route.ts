import { errorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listPlans, memberPlan } from "@/lib/plans";
import { quotaPeriod } from "@/lib/quotas";
export async function GET() {
  try {
    const user = await requireUser(); const plan = await memberPlan(user.id);
    const projects = Number((await db().execute({ sql: "SELECT count(*) AS count FROM projects WHERE owner_id=?", args: [user.id] })).rows[0].count);
    const usage: Record<string,number> = {};
    for (const resource of ["tokens","images"] as const) usage[resource] = Number((await db().execute({ sql: "SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual WHEN status='reserved' THEN reserved ELSE 0 END),0) AS used FROM quota_reservations WHERE user_id=? AND resource=? AND period=?", args: [user.id,resource,quotaPeriod(resource)] })).rows[0].used);
    return Response.json({ plan, plans: await listPlans(), usage: { ...usage, projects }, tokenPeriod: "total", imageTimezone: "Asia/Seoul" }, { headers: { "Cache-Control": "no-store" } });
  } catch(error) { return errorResponse(error); }
}
