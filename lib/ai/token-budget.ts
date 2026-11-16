import "server-only";
import { db } from "../db";
import type { User } from "../types";
import { aiUserSettings } from "./user-settings";
export async function tokenBudgetStatus(user: User) {
  const settings = await aiUserSettings(user);
  const row = (
    await db().execute({
      sql: "SELECT COALESCE(SUM(CASE WHEN usage_known=1 THEN total_tokens ELSE 0 END),0) AS total,SUM(CASE WHEN usage_final=0 THEN 1 ELSE 0 END) AS unknown,SUM(CASE WHEN status IN ('started','queued','in_progress') THEN 1 ELSE 0 END) AS running FROM ai_token_usage WHERE user_id=? AND workspace_id=? AND status<>'duplicate'",
      args: [user.id, user.workspaceId],
    })
  ).rows[0];
  const knownTotal = Number(row.total);
  return {
    knownTotal,
    tokenLimit: settings.tokenLimit,
    unknownCalls: Number(row.unknown ?? 0),
    inProgress: Number(row.running ?? 0),
    exceeded: knownTotal > settings.tokenLimit,
    scope: "현재 워크스페이스의 내 누적 사용량",
    period: "lifetime",
  };
}
