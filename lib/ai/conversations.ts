import "server-only";
import type { Row } from "@libsql/client";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { projectAccess } from "@/lib/artifacts";
import type { User } from "@/lib/types";
import type { AiConversation } from "@/lib/ai-context";
import { decryptAiImage, imageInfo } from "./chat-images";

export const conversationColumns =
  "conv_id AS convId,title,is_pinned AS isPinned,project_id AS projectId,created_at AS createdAt,updated_at AS updatedAt";
export function conversationInfo(row: Row): AiConversation {
  return {
    convId: String(row.convId),
    title: String(row.title),
    isPinned: Number(row.isPinned) === 1,
    projectId: String(row.projectId ?? ""),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}
export function conversationId(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 100)
    throw new HttpError(400, "채팅방을 선택해 주세요.");
  return value;
}
export async function requireConversation(
  user: User,
  projectId: string,
  convId: string,
) {
  if (projectId) await projectAccess(db(), user, projectId);
  const found = await db().execute({
    sql: `SELECT ${conversationColumns} FROM ai_conversations WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id IS ?`,
    args: [convId, user.workspaceId, user.id, projectId || null],
  });
  if (!found.rows.length)
    throw new HttpError(404, "채팅방을 찾을 수 없습니다.");
  return conversationInfo(found.rows[0]);
}
export async function conversationChats(
  user: User,
  projectId: string,
  convId: string,
  before?: string,
) {
  // Stable rowid cursor also handles requests committed in the same millisecond.
  const result = await db().execute({
    sql: `SELECT rowid AS cursor,id,conv_id AS convId,prompt,model,screen_title AS screenTitle,created_at AS createdAt,result FROM ai_prompt_chats WHERE workspace_id=? AND user_id=? AND project_id IS ? AND conv_id=? ${before ? "AND rowid < ?" : ""} ORDER BY rowid DESC LIMIT 51`,
    args: [
      user.workspaceId,
      user.id,
      projectId || null,
      convId,
      ...(before ? [before] : []),
    ],
  });
  const hasMore = result.rows.length > 50;
  const rows = result.rows.slice(0, 50).reverse();
  const ids = rows.map((row) => String(row.id));
  const attachments = ids.length
    ? await db().execute({
        sql: `SELECT id,chat_id,mime_type,byte_length,width,height FROM ai_chat_images WHERE workspace_id=? AND user_id=? AND chat_id IN (${ids.map(() => "?").join(",")}) ORDER BY position`,
        args: [user.workspaceId, user.id, ...ids],
      })
    : { rows: [] };
  return {
    chats: rows.map((row) => ({
      id: String(row.id),
      convId: String(row.convId),
      prompt: String(row.prompt),
      model: String(row.model),
      screenTitle: String(row.screenTitle),
      createdAt: String(row.createdAt),
      result: String(row.result),
      images: attachments.rows
        .filter((image) => image.chat_id === row.id)
        .map(imageInfo),
    })),
    nextCursor: hasMore ? String(rows[0].cursor) : null,
  };
}
export async function conversationHistory(
  user: User,
  projectId: string,
  convId: string,
) {
  const result = await db().execute({
    sql: "SELECT id,prompt,result FROM ai_prompt_chats WHERE workspace_id=? AND user_id=? AND project_id IS ? AND conv_id=? ORDER BY rowid DESC LIMIT 20",
    args: [user.workspaceId, user.id, projectId || null, convId],
  });
  let remaining = 60000;
  const selected = [];
  for (const row of result.rows) {
    const size = String(row.prompt).length + String(row.result).length;
    if (selected.length && size > remaining) break;
    selected.push(row);
    remaining -= size;
  }
  // Include the latest three historic captures, decrypted only on the server.
  const images = selected.length
    ? await db().execute({
        sql: `SELECT * FROM ai_chat_images WHERE workspace_id=? AND user_id=? AND chat_id IN (${selected.map(() => "?").join(",")}) ORDER BY rowid DESC LIMIT 3`,
        args: [
          user.workspaceId,
          user.id,
          ...selected.map((row) => String(row.id)),
        ],
      })
    : { rows: [] };
  return selected.reverse().flatMap((row) => {
    const captures = images.rows
      .filter((image) => image.chat_id === row.id)
      .reverse()
      .map((image) => ({
        type: "input_image",
        detail: "auto",
        image_url: `data:image/png;base64,${decryptAiImage(image, { chatId: String(row.id), workspaceId: user.workspaceId, userId: user.id, projectId }).toString("base64")}`,
      }));
    return [
      {
        role: "user",
        content: [
          { type: "input_text", text: String(row.prompt) },
          ...captures,
        ],
      },
      { role: "assistant", content: String(row.result).slice(0, 60000) },
    ];
  });
}
