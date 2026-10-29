import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { conversationId, requireConversation } from "@/lib/ai/conversations";
import {
  generationRequestId,
  registerGeneration,
  GenerationStopFailed,
} from "@/lib/ai/generation-control";
import { retrieveResponse, activeResponse } from "@/lib/ai/background-response";
import { createTokenTracker } from "@/lib/ai/token-usage";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      input = await body(request);
    const requestId = generationRequestId(input.requestId),
      convId = conversationId(input.convId);
    const projectId =
      typeof input.projectId === "string" ? input.projectId : "";
    await requireConversation(user, projectId, convId);
    // A stop can arrive before the generation POST. Reserve a tombstone so it cannot start later.
    await registerGeneration(user, convId, requestId, true);
    const job = (
      await db().execute({
        sql: "SELECT status,actions_json FROM ai_generation_requests WHERE request_id=?",
        args: [requestId],
      })
    ).rows[0];
    await db().execute({
      sql: "UPDATE ai_generation_requests SET status='stop_requested' WHERE request_id=? AND workspace_id=? AND user_id=? AND status IN ('running','failed')",
      args: [requestId, user.workspaceId, user.id],
    });
    const calls = await db().execute({
      sql: "SELECT * FROM ai_token_usage WHERE request_id=? AND workspace_id=? AND user_id=? AND response_id IS NOT NULL AND status IN ('queued','in_progress')",
      args: [requestId, user.workspaceId, user.id],
    });
    for (const row of calls.rows) {
      const response = await retrieveResponse(String(row.response_id), true);
      const track = createTokenTracker({
        workspaceId: user.workspaceId,
        userId: user.id,
        projectId,
        projectName: String(row.project_name),
        convId,
        conversationTitle: String(row.conversation_title),
        chatId: String(row.chat_id),
        requestId,
        model: String(row.model),
        prompt: "",
      });
      await track({
        turn: Number(row.call_index),
        responseId: String(row.response_id),
        status: String(response.status),
        usage: response.usage,
        model: typeof response.model === "string" ? response.model : undefined,
        httpStatus: 200,
      });
      if (activeResponse(response.status)) throw new GenerationStopFailed();
    }
    const settled = job.status === "failed" || job.status === "cancelled";
    if (settled)
      await db().execute({
        sql: "UPDATE ai_generation_requests SET status='cancelled',finished_at=? WHERE request_id=?",
        args: [new Date().toISOString(), requestId],
      });
    return Response.json(
      {
        status: "stop_requested",
        settled,
        actions: settled ? JSON.parse(String(job.actions_json)) : [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
