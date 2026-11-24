import { randomUUID } from "node:crypto";
import { generationRequestId } from "@/lib/ai/generation-control";
import { requireUser, checkOrigin, body, errorResponse } from "@/lib/auth";
import {
  claimApproval,
  finishApproval,
  approvalVersion,
} from "@/lib/ai/guardrail-approvals";
import { runExecution } from "@/lib/ai/execution-journal";
import { db } from "@/lib/db";
import { POST as generateChat } from "@/app/api/ai/chats/route";
export const maxDuration = 180;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      input = await body(request),
      id = (await context.params).id;
    const attemptId = input.requestId
      ? generationRequestId(input.requestId)
      : randomUUID();
    const payload = await claimApproval(
      user,
      id,
      approvalVersion(input.expectedVersion),
      attemptId,
    );
    try {
      const response = await runExecution(
        () =>
          generateChat(
            new Request(new URL("/api/ai/chats", request.url), {
              method: "POST",
              headers: request.headers,
              signal: request.signal,
              body: JSON.stringify({ ...payload.input, requestId: attemptId }),
            }),
          ),
        payload.journal,
        id,
      );
      const data = await response.clone().json();
      await finishApproval(
        user,
        id,
        data.cancelled
          ? "cancelled"
          : response.ok
            ? "completed"
            : data.code === "GUARDRAIL_APPROVAL_REQUIRED"
              ? "reblocked"
              : data.code === "GUARDRAIL_APPROVAL_INVALIDATED"
                ? "invalidated"
                : "failed",
      );
      return response;
    } catch (error) {
      await finishApproval(user, id, "failed");
      throw error;
    } finally {
      await db().execute({
        sql: "UPDATE ai_conversations SET request_id=NULL,busy_until=NULL WHERE conv_id=? AND workspace_id=? AND user_id=? AND request_id=?",
        args: [
          String(payload.input.convId),
          user.workspaceId,
          user.id,
          attemptId,
        ],
      });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
