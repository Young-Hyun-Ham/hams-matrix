import "server-only";
import { db } from "./db";
import type { User } from "./types";
import { tokenBudgetStatus } from "./ai/token-budget";
export async function headerNotifications(user: User) {
  const budget = await tokenBudgetStatus(user);
  const owner = user.role === "owner";
  const requests = user.teamSharingEnabled
    ? (
        await db().execute({
          sql: `SELECT r.id,r.requested_at,u.name,w.name AS team_name FROM team_join_requests r JOIN users u ON u.id=r.user_id JOIN workspaces w ON w.id=r.workspace_id WHERE r.status='pending' AND ${owner ? "r.workspace_id=? AND w.owner_id=?" : "r.user_id=?"} ORDER BY r.requested_at DESC,r.id`,
          args: owner ? [user.workspaceId, user.id] : [user.id],
        })
      ).rows
    : [];
  const reads = new Map(
    (
      await db().execute({
        sql: "SELECT notification_key,read_at FROM notification_acknowledgements WHERE user_id=? AND workspace_id=?",
        args: [user.id, user.workspaceId],
      })
    ).rows.map((row) => [String(row.notification_key), String(row.read_at)]),
  );
  const team = requests.map((row) => ({
    key: `team-request:${row.id}:${row.requested_at}`,
    name: String(row.name),
    teamName: String(row.team_name),
    readAt: reads.get(`team-request:${row.id}:${row.requested_at}`) ?? null,
  }));
  const ai = {
    ...budget,
    key: `ai-token-limit:${budget.tokenLimit}`,
    readAt: reads.get(`ai-token-limit:${budget.tokenLimit}`) ?? null,
  };
  return {
    budget: ai,
    requests: team,
    unread:
      team.filter((item) => !item.readAt).length +
      (ai.exceeded && !ai.readAt ? 1 : 0),
  };
}

export async function headerNotificationCount(user: User) {
  const budget = await tokenBudgetStatus(user);
  const owner = user.role === "owner";
  const team = user.teamSharingEnabled
    ? (
        await db().execute({
          sql: `SELECT COUNT(*) AS pending,COALESCE(SUM(CASE WHEN a.read_at IS NULL THEN 1 ELSE 0 END),0) AS unread FROM team_join_requests r JOIN workspaces w ON w.id=r.workspace_id LEFT JOIN notification_acknowledgements a ON a.user_id=? AND a.workspace_id=? AND a.notification_key='team-request:'||r.id||':'||r.requested_at WHERE r.status='pending' AND ${owner ? "r.workspace_id=? AND w.owner_id=?" : "r.user_id=?"}`,
          args: [
            user.id,
            user.workspaceId,
            ...(owner ? [user.workspaceId, user.id] : [user.id]),
          ],
        })
      ).rows[0]
    : undefined;
  const aiRead =
    budget.exceeded &&
    (
      await db().execute({
        sql: "SELECT 1 FROM notification_acknowledgements WHERE user_id=? AND workspace_id=? AND notification_key=?",
        args: [
          user.id,
          user.workspaceId,
          `ai-token-limit:${budget.tokenLimit}`,
        ],
      })
    ).rows.length > 0;
  return {
    unread: Number(team?.unread ?? 0) + (budget.exceeded && !aiRead ? 1 : 0),
    teamPending: Number(team?.pending ?? 0),
    aiTokenLimitExceeded: budget.exceeded,
  };
}
