import "server-only";
import { db } from "../db";
import { userInWorkspace, HttpError } from "../auth";
import {
  continueDeliverables,
  recordDeliverableResponse,
} from "./deliverable-generation";
import { retrieveResponse, activeResponse } from "./background-response";

// A persistent database queue; multiple workers coordinate through conditional leases.
export async function processNextDeliverable(exclude: string[] = []) {
  const now = new Date().toISOString();
  const row = (
    await db().execute({
      sql:
        "SELECT request_id,project_id,workspace_id,user_id,payload_json,input_json FROM project_deliverable_generation_requests WHERE status IN ('running','validating','stop_requested') AND (lease_token IS NULL OR lease_until<?)" +
        (exclude.length
          ? " AND request_id NOT IN (" + exclude.map(() => "?").join(",") + ")"
          : "") +
        " ORDER BY CASE WHEN status='stop_requested' THEN 0 ELSE 1 END,updated_at LIMIT 1",
      args: [now, ...exclude],
    })
  ).rows[0];
  if (!row) return null;
  const id = String(row.request_id);
  const run = async () => {
    try {
      const user = await userInWorkspace(
        String(row.user_id),
        String(row.workspace_id),
      );
      if (!user) throw Error("Job owner is no longer a workspace member");
      // This signal belongs to the worker, never to the user's HTTP connection.
      await continueDeliverables(
        new Request("http://deliverable-worker.local/jobs/" + id),
        user,
        String(row.project_id),
        id,
        {},
        true,
      );
    } catch {
      // Stage execution persists its own errors. Pre-lease permission failures need reconciliation.
      const current = (
        await db().execute({
          sql: "SELECT payload_json FROM project_deliverable_generation_requests WHERE request_id=? AND status IN ('running','validating','stop_requested') AND (lease_token IS NULL OR lease_until<?)",
          args: [id, new Date().toISOString()],
        })
      ).rows[0];
      if (!current) return;
      const payload = JSON.parse(String(current.payload_json));
      if (payload.aiResponseId) {
        try {
          let response = await retrieveResponse(payload.aiResponseId);
          if (activeResponse(response.status))
            response = await retrieveResponse(payload.aiResponseId, true);
          if (activeResponse(response.status)) return;
          await recordDeliverableResponse(
            {
              workspaceId: String(row.workspace_id),
              userId: String(row.user_id),
              projectId: String(row.project_id),
              requestId: id,
            },
            JSON.parse(String(row.input_json)),
            response,
          );
        } catch (error) {
          if (
            !(
              error instanceof HttpError &&
              error.details?.providerStatus === 404
            )
          )
            return;
        } // Keep the job stoppable; never claim cancellation without confirmation.
      }
      await db().execute({
        sql: "UPDATE project_deliverable_generation_requests SET status='failed',error='백그라운드 작업의 권한 또는 실행 상태를 확인할 수 없습니다.',lease_token=NULL,lease_until=NULL,updated_at=? WHERE request_id=? AND status IN ('running','validating','stop_requested') AND (lease_token IS NULL OR lease_until<?)",
        args: [new Date().toISOString(), id, new Date().toISOString()],
      });
    }
  };
  return { id, run };
}
