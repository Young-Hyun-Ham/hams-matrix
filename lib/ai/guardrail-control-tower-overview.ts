import "server-only";
import { db } from "../db";
import { approvalCounts, assertApprovalManager } from "./guardrail-approvals";

export async function guardrailOverview(
  actor: Parameters<typeof assertApprovalManager>[0],
  instant = new Date(),
) {
  // Reuse the existing expiry/abandoned execution cleanup before the read snapshot.
  await approvalCounts(actor);
  const tx = await db().transaction("read");
  try {
    await assertApprovalManager(actor, tx);
    const asOf = instant.toISOString();
    const day = new Date(instant.getTime() + 9 * 3600000)
      .toISOString()
      .slice(0, 10);
    const start = new Date(`${day}T00:00:00+09:00`).toISOString();
    const end = new Date(Date.parse(start) + 86400000).toISOString();
    const soon = new Date(instant.getTime() + 2 * 3600000).toISOString();
    const workspace = actor.workspaceId;
    const inspections = await tx.execute({
      sql: "SELECT COUNT(*) AS total,COALESCE(SUM(decision='block'),0) AS blocked FROM ai_guardrail_events WHERE workspace_id=? AND created_at>=? AND created_at<?",
      args: [workspace, start, end],
    });
    const counts = await tx.execute({
      sql: "SELECT status,COUNT(*) AS n FROM ai_guardrail_approvals WHERE workspace_id=? AND requested_at IS NOT NULL AND (status='resuming' OR (status IN ('pending','approved') AND expires_at>?)) GROUP BY status",
      args: [workspace, asOf],
    });
    const imminent = await tx.execute({
      sql: "SELECT COUNT(*) AS n FROM ai_guardrail_approvals WHERE workspace_id=? AND requested_at IS NOT NULL AND status='pending' AND expires_at>? AND expires_at<=?",
      args: [workspace, asOf, soon],
    });
    const expiring = await tx.execute({
      sql: "SELECT a.id,a.expires_at,a.rules_json,u.name AS user_name,p.name AS project_name,a.stage FROM ai_guardrail_approvals a JOIN users u ON u.id=a.user_id LEFT JOIN projects p ON p.id=a.project_id AND p.workspace_id=a.workspace_id WHERE a.workspace_id=? AND a.requested_at IS NOT NULL AND a.status='pending' AND a.expires_at>? AND a.expires_at<=? ORDER BY a.expires_at,a.id LIMIT 5",
      args: [workspace, asOf, soon],
    });
    const events = await tx.execute({
      sql: "SELECT e.id,e.created_at,e.stage,e.decision,e.policy_version,e.rules_json,(SELECT a.id FROM ai_guardrail_approvals a WHERE a.event_id=e.id AND a.workspace_id=e.workspace_id AND a.requested_at IS NOT NULL ORDER BY a.created_at DESC,a.id DESC LIMIT 1) AS approval_id FROM ai_guardrail_events e WHERE e.workspace_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 20",
      args: [workspace],
    });
    const rules = await tx.execute({
      sql: "SELECT json_extract(j.value,'$.rule') AS rule,COUNT(DISTINCT e.id) AS n FROM ai_guardrail_events e,json_each(e.rules_json) j WHERE e.workspace_id=? AND e.created_at>=? AND e.created_at<? AND e.decision='block' AND json_extract(j.value,'$.rule') IS NOT NULL GROUP BY rule ORDER BY n DESC,rule LIMIT 5",
      args: [workspace, start, end],
    });
    const stages = await tx.execute({
      sql: "SELECT stage,COUNT(*) AS n FROM ai_guardrail_events WHERE workspace_id=? AND created_at>=? AND created_at<? GROUP BY stage ORDER BY stage",
      args: [workspace, start, end],
    });
    await tx.commit();
    return {
      asOf,
      timeZone: "Asia/Seoul",
      todayRange: { start, end },
      inspectionCounts: {
        total: Number(inspections.rows[0].total),
        blocked: Number(inspections.rows[0].blocked),
      },
      approvalCounts: Object.fromEntries(
        ["pending", "approved", "resuming"].map((status) => [
          status,
          Number(counts.rows.find((r) => r.status === status)?.n ?? 0),
        ]),
      ),
      expiringSoonCount: Number(imminent.rows[0].n),
      expiringApprovals: expiring.rows.map((r) => ({
        rules: (JSON.parse(String(r.rules_json)) as { rule: string }[]).map(
          (f) => f.rule,
        ),
        id: String(r.id),
        expiresAt: String(r.expires_at),
        userName: String(r.user_name),
        projectName: String(r.project_name ?? "프로젝트 없음"),
        stage: String(r.stage),
      })),
      recentEvents: events.rows.map((r) => ({
        id: String(r.id),
        createdAt: String(r.created_at),
        stage: String(r.stage),
        decision: String(r.decision),
        policyVersion: Number(r.policy_version),
        rules: (JSON.parse(String(r.rules_json)) as { rule: string }[]).map(
          (f) => f.rule,
        ),
        approvalId: r.approval_id ? String(r.approval_id) : null,
      })),
      blockedRules: rules.rows.map((r) => ({
        rule: String(r.rule),
        count: Number(r.n),
      })),
      stageCounts: stages.rows.map((r) => ({
        stage: String(r.stage),
        count: Number(r.n),
      })),
    };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
export type GuardrailOverview = Awaited<ReturnType<typeof guardrailOverview>>;
