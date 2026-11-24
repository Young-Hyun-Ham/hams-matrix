// Maintenance only. Does not decrypt or print prompts, attachments or credentials.
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
if (!process.env.TURSO_DATABASE_URL)
  throw Error("Database configuration required");
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  const tx = await db.transaction("write"),
    now = new Date().toISOString();
  let changed = 0;
  try {
    const due = await tx.execute({
      sql: "SELECT id,user_id,status,version,attempt_request_id FROM ai_guardrail_approvals WHERE (status IN ('awaiting_choice','pending','approved') AND expires_at<=?) OR (status='resuming' AND lease_until<=?)",
      args: [now, now],
    });
    for (const row of due.rows) {
      const status = row.status === "resuming" ? "failed" : "expired";
      await tx.execute({
        sql: "UPDATE ai_guardrail_approvals SET status=?,version=version+1,checkpoint_json=NULL,finished_at=? WHERE id=? AND version=?",
        args: [status, now, row.id, row.version],
      });
      if (row.attempt_request_id)
        await tx.execute({
          sql: "UPDATE ai_generation_requests SET status='stop_requested' WHERE request_id=? AND status IN ('running','finalizing')",
          args: [row.attempt_request_id],
        });
      await tx.execute({
        sql: "INSERT INTO ai_guardrail_approval_events(id,approval_id,actor_id,status,comment,created_at) VALUES (?,?,?,?,?,?)",
        args: [
          randomUUID(),
          row.id,
          row.user_id,
          status,
          "유효기간 또는 실행 연결 만료",
          now,
        ],
      });
      changed++;
    }
    await tx.commit();
    console.log(
      `Guardrail maintenance completed: ${changed} expired/abandoned requests cleared.`,
    );
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
} finally {
  db.close();
}
