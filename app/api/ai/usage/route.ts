import type { Row } from "@libsql/client";
import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TokenTotals } from "@/lib/ai/token-types";

const sums =
  "COALESCE(SUM(input_tokens),0) AS input,COALESCE(SUM(output_tokens),0) AS output,COALESCE(SUM(total_tokens),0) AS total,COALESCE(SUM(cached_tokens),0) AS cached,COALESCE(SUM(reasoning_tokens),0) AS reasoning,COUNT(*) AS calls,COUNT(DISTINCT request_id) AS requests,SUM(CASE WHEN usage_known=0 AND status<>'duplicate' THEN 1 ELSE 0 END) AS unknown";
function totals(row?: Row): TokenTotals {
  return Object.fromEntries(
    [
      "input",
      "output",
      "total",
      "cached",
      "reasoning",
      "calls",
      "requests",
      "unknown",
    ].map((key) => [key, Number(row?.[key] ?? 0)]),
  ) as TokenTotals;
}
function date(value: string | null) {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "2000-01-01" ||
    value > "2100-12-31"
  )
    throw new HttpError(400, "조회 날짜를 확인해 주세요.");
  const utc = new Date(`${value}T00:00:00.000Z`);
  if (isNaN(utc.getTime()) || utc.toISOString().slice(0, 10) !== value)
    throw new HttpError(400, "올바른 날짜를 입력해 주세요.");
  return utc;
}
export async function GET(request: Request) {
  try {
    const user = await requireUser(),
      params = new URL(request.url).searchParams;
    const from = date(params.get("from")),
      to = date(params.get("to"));
    const days = (to.getTime() - from.getTime()) / 86400000;
    if (days < 0 || days > 366)
      throw new HttpError(400, "조회 기간은 최대 367일입니다.");
    const group = params.get("group") || "daily";
    if (!["monthly", "weekday", "daily"].includes(group))
      throw new HttpError(400, "통계 구분을 확인해 주세요.");
    const projectId = params.get("projectId"),
      convId = params.get("convId");
    if ((projectId?.length ?? 0) > 100 || (convId?.length ?? 0) > 100)
      throw new HttpError(400, "조회 범위를 확인해 주세요.");
    const scope = [user.workspaceId, user.id];
    const where =
      "workspace_id=? AND user_id=? AND created_at>=? AND created_at<?" +
      (projectId !== null ? " AND project_id IS ?" : "") +
      (convId ? " AND conv_id=?" : "");
    // Convert Korean calendar boundaries to UTC, using an exclusive upper bound.
    const args = [
      ...scope,
      new Date(from.getTime() - 9 * 3600000).toISOString(),
      new Date(to.getTime() + 86400000 - 9 * 3600000).toISOString(),
      ...(projectId !== null ? [projectId || null] : []),
      ...(convId ? [convId] : []),
    ];
    const expression =
      group === "monthly"
        ? "strftime('%Y-%m',created_at,'+9 hours')"
        : group === "weekday"
          ? "strftime('%w',created_at,'+9 hours')"
          : "date(created_at,'+9 hours')";
    const results = await Promise.all([
      db().execute({
        sql: `SELECT ${sums} FROM ai_token_usage WHERE ${where}`,
        args,
      }),
      db().execute({
        sql: `SELECT ${expression} AS bucket,${sums} FROM ai_token_usage WHERE ${where} GROUP BY bucket ORDER BY bucket`,
        args,
      }),
      db().execute({
        sql: "SELECT project_id AS id,MAX(project_name) AS name FROM ai_token_usage WHERE workspace_id=? AND user_id=? GROUP BY project_id",
        args: scope,
      }),
      db().execute({
        sql: "SELECT u.conv_id AS id,u.project_id AS projectId,COALESCE(c.title,MAX(u.conversation_title)) AS title,CASE WHEN c.conv_id IS NULL THEN 1 ELSE 0 END AS deleted FROM ai_token_usage u LEFT JOIN ai_conversations c ON c.conv_id=u.conv_id AND c.workspace_id=u.workspace_id AND c.user_id=u.user_id WHERE u.workspace_id=? AND u.user_id=? GROUP BY u.conv_id,u.project_id ORDER BY MAX(u.created_at) DESC",
        args: scope,
      }),
      db().execute({
        sql: "SELECT DISTINCT strftime('%Y',created_at,'+9 hours') AS year FROM ai_token_usage WHERE workspace_id=? AND user_id=? ORDER BY year DESC",
        args: scope,
      }),
    ]);
    const keys: { key: string; label: string }[] = [];
    if (group === "weekday")
      ["월", "화", "수", "목", "금", "토", "일"].forEach((label, index) =>
        keys.push({ key: String((index + 1) % 7), label }),
      );
    else {
      const cursor = new Date(from);
      if (group === "monthly") cursor.setUTCDate(1);
      while (cursor <= to) {
        const key = cursor.toISOString().slice(0, group === "monthly" ? 7 : 10);
        keys.push({
          key,
          label:
            group === "monthly"
              ? `${cursor.getUTCMonth() + 1}월`
              : `${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}`,
        });
        if (group === "monthly") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        else cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    return Response.json(
      {
        timezone: "Asia/Seoul",
        totals: totals(results[0].rows[0]),
        series: keys.map((item) => ({
          ...item,
          ...totals(results[1].rows.find((row) => row.bucket === item.key)),
        })),
        projects: results[2].rows.map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name || "공통 작업 공간"),
        })),
        conversations: results[3].rows.map((row) => ({
          id: String(row.id),
          projectId: String(row.projectId ?? ""),
          title: String(row.title),
          deleted: Number(row.deleted) === 1,
        })),
        years: results[4].rows.map((row) => Number(row.year)),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
