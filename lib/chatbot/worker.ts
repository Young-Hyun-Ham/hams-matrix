import "server-only";
import { db } from "@/lib/db";
import { transaction, now, future } from "./server";
import { executeJob } from "./generation";
import { executeRun } from "./scenarios";
import { cleanupClarifications } from "./clarification";
export async function nextJob() {
  // An expired paid call is uncertain, never returned to the runnable queue.
  await db().execute({
    sql: "UPDATE chatbot_requests SET status='unknown',error_code='WORKER_INTERRUPTED',lease_until=NULL WHERE status='running' AND lease_until IS NOT NULL AND lease_until<?",
    args: [now()],
  });
  await db().execute({
    sql: "UPDATE chatbot_scenario_runs SET status='interrupted',error_code='WORKER_INTERRUPTED',lease_until=NULL,version=version+1 WHERE status='running' AND lease_until<?",
    args: [now()],
  });
  await db().execute(
    "UPDATE chatbot_requests SET status='unknown',error_code='WORKER_INTERRUPTED',lease_until=NULL WHERE status='running' AND run_id IN (SELECT id FROM chatbot_scenario_runs WHERE status='interrupted')",
  );
  await db().execute(
    "UPDATE chatbot_turns SET status='unknown' WHERE status IN ('queued','running') AND EXISTS(SELECT 1 FROM chatbot_requests r WHERE r.turn_id=chatbot_turns.id AND r.status='unknown')",
  );
  return transaction(async (tx) => {
    const request = (
      await tx.execute(
        "SELECT id FROM chatbot_requests WHERE status='queued' AND operation='message' ORDER BY created_at,id LIMIT 1",
      )
    ).rows[0];
    if (request) {
      await tx.execute({
        sql: "UPDATE chatbot_requests SET status='running',lease_until=? WHERE id=? AND status='queued'",
        args: [future(300000), request.id],
      });
      return { id: String(request.id), kind: "message" };
    }
    const run = (
      await tx.execute(
        "SELECT id FROM chatbot_scenario_runs WHERE status='queued' ORDER BY created_at,id LIMIT 1",
      )
    ).rows[0];
    if (run) {
      await tx.execute({
        sql: "UPDATE chatbot_scenario_runs SET status='running',lease_until=? WHERE id=? AND status='queued'",
        args: [future(300000), run.id],
      });
      return { id: String(run.id), kind: "scenario" };
    }
    return null;
  });
}
export async function processJob(job: { id: string; kind: string }) {
  if (job.kind === "message") await executeJob(job.id);
  else await executeRun(job.id);
}
export async function cleanup() {
  await db().execute({
    sql: "UPDATE chatbot_request_steps SET status='unknown',completed_at=? WHERE status='started' AND EXISTS(SELECT 1 FROM chatbot_requests r WHERE r.id=chatbot_request_steps.request_id AND r.status IN ('unknown','failed','cancelled'))",
    args: [now()],
  });
  await cleanupClarifications();
  await cleanupObjects();
  await db().execute(
    "UPDATE chatbot_policy_approvals SET checkpoint_ciphertext='' WHERE status IN ('expired','cancelled','rejected','completed') AND checkpoint_ciphertext!=''",
  );
  return transaction(async (tx) => {
    await tx.execute({
      sql: "UPDATE chatbot_reviews SET status='expired',version=version+1 WHERE status='pending' AND expires_at<?",
      args: [now()],
    });
    await tx.execute({
      sql: "UPDATE chatbot_policy_approvals SET status='expired',version=version+1 WHERE status IN ('awaiting_choice','pending','approved') AND expires_at<?",
      args: [now()],
    });
    await tx.execute(
      "UPDATE chatbot_requests SET status='cancelled',stop_requested=1 WHERE status IN ('waiting_review','waiting_policy_approval') AND (EXISTS(SELECT 1 FROM chatbot_reviews v WHERE v.request_id=chatbot_requests.id AND v.status='expired') OR EXISTS(SELECT 1 FROM chatbot_policy_approvals a WHERE a.request_id=chatbot_requests.id AND a.status='expired'))",
    );
    await tx.execute(
      "UPDATE chatbot_scenario_runs SET status='cancelled',version=version+1 WHERE status IN ('waiting_review','waiting_policy_approval') AND EXISTS(SELECT 1 FROM chatbot_requests r WHERE r.run_id=chatbot_scenario_runs.id AND r.stop_requested=1)",
    );
  });
}

async function cleanupObjects() {
  const { removeDocument } = await import("@/lib/r2");
  const rows = (
    await db().execute({
      sql: "SELECT b.* FROM chatbot_blob_uploads b WHERE b.status='staged' AND b.created_at<? AND NOT EXISTS(SELECT 1 FROM chatbot_attachments a WHERE a.storage_key=b.storage_key) AND NOT EXISTS(SELECT 1 FROM chatbot_artifact_versions v WHERE v.storage_key=b.storage_key) LIMIT 50",
      args: [new Date(Date.now() - 86400000).toISOString()],
    })
  ).rows;
  for (const r of rows) {
    if (
      !String(r.storage_key).startsWith(
        "chatbot/" + r.workspace_id + "/" + r.user_id + "/",
      )
    )
      continue;
    await removeDocument(String(r.storage_key));
    await db().execute({
      sql: "DELETE FROM chatbot_blob_uploads WHERE id=? AND status='staged'",
      args: [r.id],
    });
  }
  const uploads = (
    await db().execute({
      sql: "SELECT * FROM chatbot_attachments a WHERE a.expires_at<? AND NOT EXISTS(SELECT 1 FROM chatbot_requests r,json_each(r.attachment_ids_json) refs WHERE refs.value=a.id) LIMIT 50",
      args: [now()],
    })
  ).rows;
  for (const a of uploads) {
    if (
      !String(a.storage_key).startsWith(
        "chatbot/" + a.workspace_id + "/" + a.user_id + "/",
      )
    )
      continue;
    await removeDocument(String(a.storage_key));
    await db().batch(
      [
        { sql: "DELETE FROM chatbot_blob_uploads WHERE id=?", args: [a.id] },
        { sql: "DELETE FROM chatbot_attachments WHERE id=?", args: [a.id] },
      ],
      "write",
    );
  }
}
