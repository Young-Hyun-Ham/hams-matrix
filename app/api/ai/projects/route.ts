import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspacePlan } from "@/lib/plans";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (user.accountRole === "guest" || !user.onboardingComplete)
      throw new HttpError(403, "프로젝트 접근 권한이 없습니다.");
    await workspacePlan(user.id, user.workspaceId);
    const params = new URL(request.url).searchParams,
      q = params.get("q") ?? "",
      cursor = params.get("cursor") ?? "",
      limit = Number(params.get("limit") ?? 50);
    if (
      q.length > 100 ||
      cursor.length > 100 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new HttpError(400, "프로젝트 검색 조건을 확인해 주세요.");
    const rows = (
      await db().execute({
        sql: "SELECT p.id,p.name,p.status FROM projects p JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id AND m.user_id=? WHERE p.workspace_id=? AND p.id>? AND instr(lower(p.name),lower(?))>0 ORDER BY p.id LIMIT ?",
        args: [user.id, user.workspaceId, cursor, q, limit + 1],
      })
    ).rows;
    return Response.json(
      {
        projects: rows.slice(0, limit),
        nextCursor: rows.length > limit ? String(rows[limit - 1].id) : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
