import { randomUUID } from "node:crypto";
import {
  body,
  checkOrigin,
  errorResponse,
  requireUser,
  rateLimit,
  HttpError,
} from "@/lib/auth";
import { workspacePlan } from "@/lib/plans";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/artifacts";
import { conversationColumns, conversationInfo } from "@/lib/ai/conversations";
import { validateTarget } from "@/lib/ai/resolve-target";
import { targetFromLocation } from "@/lib/ai-target-pages";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const projectId = new URL(request.url).searchParams.get("projectId") || "";
    if (projectId) await projectAccess(db(), user, projectId);
    if (!(await workspacePlan(user.id, user.workspaceId)).historyEnabled)
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
    const source = input.sourceContext as Record<string, unknown> | undefined;
    const requestedTarget =
      input.targetPage ??
      (source
        ? targetFromLocation(projectId, source.pathname, source.tab)
        : null);
    const initialTarget =
      requestedTarget === null
        ? null
        : (await validateTarget(user, projectId, requestedTarget, true))
            .targetPage;
    if (source && !initialTarget)
      throw new HttpError(400, "새 채팅의 현재 화면을 확인해 주세요.");
    if (initialTarget !== null) {
      if (
        source &&
        targetFromLocation(projectId, source.pathname, source.tab) !==
          initialTarget
      )
        throw new HttpError(400, "새 채팅의 AI 대상은 현재 화면이어야 합니다.");
    }
    const conversation = {
      convId:
        ((await workspacePlan(user.id, user.workspaceId)).historyEnabled ? "" : "temporary-") +
        randomUUID(),
      projectId,
      title: "새 채팅",
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: "",
      targetPage: initialTarget,
      targetVersion: initialTarget === null ? 0 : 1,
    };
    conversation.updatedAt = conversation.createdAt;
    if (!conversation.convId.startsWith("temporary-"))
      await db().execute({
        sql: "INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,created_at,updated_at,target_page,target_version) VALUES (?,?,?,?,?,?,?,?,?)",
        args: [
          conversation.convId,
          user.workspaceId,
          user.id,
          projectId || null,
          conversation.title,
          conversation.createdAt,
          conversation.updatedAt,
          conversation.targetPage,
          conversation.targetVersion,
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
