import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { db } from "@/lib/db";
import {
  conversationId,
  requireConversation,
  conversationColumns,
  conversationInfo,
} from "@/lib/ai/conversations";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ convId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      input = await body(request);
    const convId = conversationId((await context.params).convId);
    const projectId =
      typeof input.projectId === "string" ? input.projectId : "";
    const hasTitle = Object.hasOwn(input, "title"),
      hasPin = Object.hasOwn(input, "isPinned");
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (hasTitle && (!title || title.length > 100))
      throw new HttpError(400, "채팅방 제목은 1~100자로 입력해 주세요.");
    if (
      (!hasTitle && !hasPin) ||
      (hasPin && typeof input.isPinned !== "boolean")
    )
      throw new HttpError(400, "변경할 제목 또는 고정 여부를 확인해 주세요.");
    await requireConversation(user, projectId, convId);
    const updated = await db().execute({
      sql: `UPDATE ai_conversations SET ${[hasTitle ? "title=?,updated_at=?" : "", hasPin ? "is_pinned=?" : ""].filter(Boolean).join(",")} WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id IS ? RETURNING ${conversationColumns}`,
      args: [
        ...(hasTitle ? [title, new Date().toISOString()] : []),
        ...(hasPin ? [input.isPinned ? 1 : 0] : []),
        convId,
        user.workspaceId,
        user.id,
        projectId || null,
      ],
    });
    if (!updated.rows.length)
      throw new HttpError(404, "채팅방을 찾을 수 없습니다.");
    return Response.json(
      { conversation: conversationInfo(updated.rows[0]) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ convId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      input = await body(request);
    const convId = conversationId((await context.params).convId);
    const projectId =
      typeof input.projectId === "string" ? input.projectId : "";
    await requireConversation(user, projectId, convId);
    const tx = await db().transaction("write");
    try {
      const args = [convId, user.workspaceId, user.id, projectId || null];
      const room = await tx.execute({
        sql: "SELECT request_id,busy_until FROM ai_conversations WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id IS ?",
        args,
      });
      if (!room.rows.length)
        throw new HttpError(404, "채팅방을 찾을 수 없습니다.");
      if (
        room.rows[0].request_id &&
        String(room.rows[0].busy_until) >= new Date().toISOString()
      )
        throw new HttpError(
          409,
          "답변을 생성 중인 채팅방입니다. 생성이 끝난 뒤 삭제해 주세요.",
        );
      // Delete explicitly so cleanup also works when a connection has foreign keys disabled.
      await tx.execute({
        sql: "DELETE FROM ai_chat_images WHERE workspace_id=? AND user_id=? AND chat_id IN (SELECT id FROM ai_prompt_chats WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id IS ?)",
        args: [user.workspaceId, user.id, ...args],
      });
      await tx.execute({
        sql: "DELETE FROM ai_prompt_chats WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id IS ?",
        args,
      });
      await tx.execute({
        sql: "DELETE FROM ai_conversations WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id IS ?",
        args,
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
    return Response.json(
      { convId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
