import "server-only";
import { HttpError } from "../auth";
import { db } from "../db";
import type { User } from "../types";
import type { AiConversation } from "../ai-context";
import {
  requireConversation,
  conversationColumns,
  conversationInfo,
} from "./conversations";
import { validateTarget } from "./resolve-target";

export class ConversationTargetConflict extends HttpError {
  constructor(public conversation: AiConversation) {
    super(
      409,
      "AI 대상이 변경되었거나 답변 생성 중입니다. 최신 대상을 확인한 뒤 다시 시도해 주세요.",
    );
  }
}
export function targetVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new HttpError(400, "AI 대상 버전을 확인해 주세요.");
  return value as number;
}

export async function saveConversationTarget(
  user: User,
  projectId: string,
  convId: string,
  target: unknown,
  expectedVersion: unknown,
  allowUnsupported = false,
) {
  const version = targetVersion(expectedVersion);
  const conversation = await requireConversation(user, projectId, convId);
  const { targetPage } = await validateTarget(
    user,
    projectId,
    target,
    allowUnsupported,
  );
  if (convId.startsWith("temporary-"))
    throw new HttpError(
      400,
      "임시 채팅의 AI 대상은 현재 세션에서만 유지됩니다.",
    );
  const updated = await db().execute({
    sql: `UPDATE ai_conversations SET target_page=?,target_version=target_version+1
      WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id IS ? AND target_version=?
        AND (request_id IS NULL OR busy_until < ?)
        AND NOT EXISTS (SELECT 1 FROM ai_generation_requests g WHERE g.conv_id=ai_conversations.conv_id AND g.workspace_id=ai_conversations.workspace_id AND g.user_id=ai_conversations.user_id AND g.status IN ('running','stop_requested','finalizing') AND g.finished_at IS NULL AND datetime(g.created_at)>=datetime(?))
        AND NOT EXISTS (SELECT 1 FROM ai_token_usage t WHERE t.conv_id=ai_conversations.conv_id AND t.workspace_id=ai_conversations.workspace_id AND t.user_id=ai_conversations.user_id AND t.status IN ('queued','in_progress'))
      RETURNING ${conversationColumns}`,
    args: [
      targetPage,
      convId,
      user.workspaceId,
      user.id,
      projectId || null,
      version,
      new Date().toISOString(),
      new Date(Date.now() - 240000).toISOString(),
    ],
  });
  if (!updated.rows.length)
    throw new ConversationTargetConflict(
      await requireConversation(user, projectId, convId),
    );
  // Target-only changes intentionally do not reorder conversation activity.
  return { ...conversation, ...conversationInfo(updated.rows[0]) };
}
