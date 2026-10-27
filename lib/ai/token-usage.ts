import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { AiCallEvent } from "./token-types";

function count(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
export function parseTokenUsage(value: unknown) {
  const usage =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const input = count(usage.input_tokens),
    output = count(usage.output_tokens),
    total = count(usage.total_tokens);
  if (
    input === null ||
    output === null ||
    total === null ||
    total !== input + output
  )
    return null;
  const inputDetails = usage.input_tokens_details as
    | Record<string, unknown>
    | undefined;
  const outputDetails = usage.output_tokens_details as
    | Record<string, unknown>
    | undefined;
  const cached = count(inputDetails?.cached_tokens),
    reasoning = count(outputDetails?.reasoning_tokens);
  return {
    input,
    output,
    total,
    cached: cached !== null && cached <= input ? cached : null,
    reasoning: reasoning !== null && reasoning <= output ? reasoning : null,
  };
}
export function createTokenTracker(scope: {
  workspaceId: string;
  userId: string;
  projectId: string;
  projectName: string;
  convId: string;
  conversationTitle: string;
  chatId: string;
  requestId: string;
  model: string;
  prompt: string;
}) {
  return async function track(event: AiCallEvent) {
    if (event.status === "started") {
      // Reserve durable storage before the paid call. A crash leaves an explicit unknown record.
      await db().execute({
        sql: "INSERT INTO ai_token_usage(id,workspace_id,user_id,project_id,project_name,conv_id,conversation_title,chat_id,request_id,call_index,model,prompt_characters,created_at,purpose) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(request_id,call_index) DO NOTHING",
        args: [
          randomUUID(),
          scope.workspaceId,
          scope.userId,
          scope.projectId || null,
          scope.projectName,
          scope.convId,
          scope.conversationTitle,
          scope.chatId,
          scope.requestId,
          event.turn,
          event.model ?? scope.model,
          Array.from(scope.prompt).length,
          new Date().toISOString(),
          event.purpose ?? "generation",
        ],
      });
      return;
    }
    const usage = parseTokenUsage(event.usage);
    const tx = await db().transaction("write");
    try {
      const duplicates =
        event.responseId && usage
          ? await tx.execute({
              sql: "SELECT id FROM ai_token_usage WHERE provider='openai' AND response_id=? AND usage_known=1 AND NOT(request_id=? AND call_index=?)",
              args: [event.responseId, scope.requestId, event.turn],
            })
          : { rows: [] };
      const previous = (await tx.execute({
        sql: "SELECT response_id,status,input_tokens,output_tokens,total_tokens,cached_tokens,reasoning_tokens,usage_known,usage_final FROM ai_token_usage WHERE request_id=? AND call_index=?",
        args: [scope.requestId, event.turn],
      })).rows[0];
      const running = ["queued", "in_progress"].includes(event.status);
      if (running && previous && !["started", "queued", "in_progress"].includes(String(previous.status))) {
        await tx.commit();
        return; // Ignore a poll that arrived after cancellation was already recorded.
      }
      // A later status without usage must not erase an already measured snapshot.
      const measured = duplicates.rows.length ? null : usage ?? (previous?.usage_known ? {
        input: Number(previous.input_tokens), output: Number(previous.output_tokens), total: Number(previous.total_tokens),
        cached: previous.cached_tokens === null ? null : Number(previous.cached_tokens),
        reasoning: previous.reasoning_tokens === null ? null : Number(previous.reasoning_tokens),
      } : null);
      await tx.execute({
        sql: "UPDATE ai_token_usage SET response_id=?,model=?,status=?,http_status=?,usage_known=?,input_tokens=?,output_tokens=?,total_tokens=?,cached_tokens=?,reasoning_tokens=?,duration_ms=?,finished_at=?,usage_final=? WHERE request_id=? AND call_index=? AND workspace_id=? AND user_id=?",
        args: [
          event.responseId || previous?.response_id || null,
          event.model || scope.model,
          duplicates.rows.length ? "duplicate" : event.status,
          event.httpStatus ?? null,
          measured ? 1 : 0,
          measured?.input ?? null,
          measured?.output ?? null,
          measured?.total ?? null,
          measured?.cached ?? null,
          measured?.reasoning ?? null,
          event.durationMs ?? null,
          running ? null : new Date().toISOString(),
          measured && ((!running && usage) || previous?.usage_final) ? 1 : 0,
          scope.requestId,
          event.turn,
          scope.workspaceId,
          scope.userId,
        ],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  };
}
