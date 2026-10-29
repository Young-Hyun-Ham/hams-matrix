import { randomUUID } from "node:crypto";
import {
  body,
  checkOrigin,
  errorResponse,
  requireUser,
  rateLimit,
} from "@/lib/auth";
import { memberPlan } from "@/lib/plans";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/artifacts";
import { conversationColumns, conversationInfo } from "@/lib/ai/conversations";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const projectId = new URL(request.url).searchParams.get("projectId") || "";
    if (projectId) await projectAccess(db(), user, projectId);
    if (!(await memberPlan(user.id)).historyEnabled)
      return Response.json({ conversations: [], historyEnabled: false });
    const rows = await db().execute({
      sql: `SELECT ${conversationColumns} FROM ai_conversations WHERE workspace_id=? AND user_id=? AND project_id IS ? ORDER BY is_pinned DESC,updated_at DESC,conv_id DESC`,
      args: [user.workspaceId, user.id, projectId || null],
    });
    return Response.json(
      { conversations: rows.rows.map(conversationInfo) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      input = await body(request);
    const projectId =
      typeof input.projectId === "string" ? input.projectId : "";
    if (projectId) await projectAccess(db(), user, projectId);
    await rateLimit(`ai-room:${user.workspaceId}:${user.id}`, 40);
    const conversation = {
      convId:
        ((await memberPlan(user.id)).historyEnabled ? "" : "temporary-") +
        randomUUID(),
      projectId,
      title: "새 채팅",
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: "",
    };
    conversation.updatedAt = conversation.createdAt;
    if (!conversation.convId.startsWith("temporary-"))
      await db().execute({
        sql: "INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        args: [
          conversation.convId,
          user.workspaceId,
          user.id,
          projectId || null,
          conversation.title,
          conversation.createdAt,
          conversation.updatedAt,
        ],
      });
    return Response.json(
      { conversation },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
