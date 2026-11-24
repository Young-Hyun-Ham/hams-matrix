import "server-only";
import type { Client } from "@libsql/client";
import { db } from "../db";
import type { User } from "../types";
import { HttpError } from "../auth";

type Executor = Pick<Client, "execute">;
export type TurnIdentity = { id: string; seq: number };

// AUTOINCREMENT is allocated by SQLite, never from a client clock or COUNT(*).
export async function startConversationTurn(
  user: User,
  projectId: string,
  convId: string,
  id: string,
  requestId: string,
) {
  const tx = await db().transaction("write");
  try {
    const createdAt = new Date().toISOString();
    const result = await tx.execute({
      sql: "INSERT INTO ai_conversation_turns(turn_id,workspace_id,user_id,project_id,conv_id,logical_request_id,status,created_at) VALUES (?,?,?,?,?,?,'running',?) RETURNING seq",
      args: [
        id,
        user.workspaceId,
        user.id,
        projectId || null,
        convId,
        requestId,
        createdAt,
      ],
    });
    await tx.execute({
      sql: "UPDATE ai_conversations SET updated_at=? WHERE conv_id=? AND workspace_id=? AND user_id=?",
      args: [createdAt, convId, user.workspaceId, user.id],
    });
    await tx.commit();
    return { id, seq: Number(result.rows[0].seq) };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}

export async function requireTurn(
  user: User,
  convId: string,
  id: string,
  executor: Executor = db(),
) {
  const result = await executor.execute({
    sql: "SELECT seq FROM ai_conversation_turns WHERE turn_id=? AND workspace_id=? AND user_id=? AND conv_id=?",
    args: [id, user.workspaceId, user.id, convId],
  });
  if (!result.rows.length)
    throw new HttpError(409, "원래 대화를 찾을 수 없습니다.");
  return { id, seq: Number(result.rows[0].seq) };
}

export async function finishConversationTurn(id: string, status: string) {
  await db().execute({
    sql: "UPDATE ai_conversation_turns SET status=?,version=version+1 WHERE turn_id=? AND status='running' AND final_chat_id IS NULL",
    args: [status, id],
  });
}
