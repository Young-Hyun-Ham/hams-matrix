import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { projectAccess } from "@/lib/artifacts";
import { db } from "@/lib/db";
import { decryptAiImage } from "@/lib/ai/chat-images";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string; imageId: string }> },
) {
  try {
    const user = await requireUser(),
      { chatId, imageId } = await params;
    const result = await db().execute({
      sql: "SELECT i.*,c.project_id FROM ai_chat_images i JOIN ai_prompt_chats c ON c.id=i.chat_id AND c.workspace_id=i.workspace_id AND c.user_id=i.user_id WHERE i.id=? AND i.chat_id=? AND c.workspace_id=? AND c.user_id=?",
      args: [imageId, chatId, user.workspaceId, user.id],
    });
    const row = result.rows[0];
    if (!row) throw new HttpError(404, "첨부 이미지를 찾을 수 없습니다.");
    const projectId = row.project_id ? String(row.project_id) : "";
    if (projectId) await projectAccess(db(), user, projectId);
    const plaintext = decryptAiImage(row, {
      chatId,
      workspaceId: user.workspaceId,
      userId: user.id,
      projectId,
    });
    return new Response(new Uint8Array(plaintext), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(plaintext.length),
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="capture.png"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
