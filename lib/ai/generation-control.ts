import "server-only";
import type { Client } from "@libsql/client";
import { db } from "../db";
import { HttpError } from "../auth";
import type { User } from "../types";

export class GenerationCancelled extends Error {
  constructor() {
    super("AI 생성이 중지되었습니다.");
  }
}
export class GenerationStopFailed extends HttpError {
  constructor() {
    super(
      502,
      "AI 서버의 중지가 확인되지 않았습니다. 중지 재시도를 눌러 주세요.",
    );
  }
}
export function generationRequestId(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new HttpError(400, "생성 요청 ID를 확인해 주세요.");
  return value;
}
export async function registerGeneration(
  user: User,
  convId: string,
  requestId: string,
  stop = false,
) {
  const inserted = await db().execute({
    sql: "INSERT INTO ai_generation_requests(request_id,workspace_id,user_id,conv_id,status) VALUES (?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING RETURNING request_id",
    args: [
      requestId,
      user.workspaceId,
      user.id,
      convId,
      stop ? "stop_requested" : "running",
    ],
  });
  const row = (
    await db().execute({
      sql: "SELECT status FROM ai_generation_requests WHERE request_id=? AND workspace_id=? AND user_id=? AND conv_id=?",
      args: [requestId, user.workspaceId, user.id, convId],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "생성 요청을 찾을 수 없습니다.");
  if (!stop && !inserted.rows.length && row.status !== "stop_requested")
    throw new HttpError(409, "이미 처리한 생성 요청입니다.");
}
export function generationCheckpoint(requestId: string, signal: AbortSignal) {
  return async (executor: Pick<Client, "execute"> = db()) => {
    if (signal.aborted) throw new GenerationCancelled();
    const row = (
      await executor.execute({
        sql: "SELECT status FROM ai_generation_requests WHERE request_id=?",
        args: [requestId],
      })
    ).rows[0];
    if (!row || row.status === "stop_requested" || row.status === "cancelled")
      throw new GenerationCancelled();
  };
}
