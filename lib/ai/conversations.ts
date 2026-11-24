import { reviewInfo } from "./change-reviews";
import { sharedHistoryOrigin } from "./shared-answers";
import { parseProvenance } from "./answer-provenance";
import "server-only";
import type { Row, Client } from "@libsql/client";
import { workspacePlan } from "@/lib/plans";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import { projectAccess } from "@/lib/artifacts";
import type { User } from "@/lib/types";
import type { AiConversation } from "@/lib/ai-context";
import { decryptAiImage, imageInfo } from "./chat-images";
import { isAiTargetPage } from "../ai-target-pages";
import { executionHash, type ExecutionJournal } from "./execution-journal";

export const conversationColumns =
  "conv_id AS convId,title,is_pinned AS isPinned,project_id AS projectId,created_at AS createdAt,updated_at AS updatedAt,target_page AS targetPage,target_version AS targetVersion,title_source AS titleSource,title_version AS titleVersion";
export function conversationInfo(row: Row): AiConversation {
  return {
    convId: String(row.convId),
    title: String(row.title),
    titleSource: String(row.titleSource),
    titleVersion: Number(row.titleVersion ?? 0),
    isPinned: Number(row.isPinned) === 1,
    projectId: String(row.projectId ?? ""),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    targetPage: isAiTargetPage(row.targetPage) ? row.targetPage : null,
    targetVersion: Number(row.targetVersion ?? 0),
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
  if (!(await workspacePlan(user.id, user.workspaceId)).historyEnabled) {
    if (!/^temporary-[0-9a-f-]{36}$/.test(convId))
      throw new HttpError(404, "새 임시 채팅을 시작해 주세요.");
    const now = new Date().toISOString();
    return {
      convId,
      projectId,
      title: "새 채팅",
      titleSource: "auto_pending",
      titleVersion: 0,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      targetPage: null,
      targetVersion: 0,
    };
  }
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
  if (!(await workspacePlan(user.id, user.workspaceId)).historyEnabled)
    return { chats: [], turns: [], nextCursor: null };
  // A versioned turn cursor keeps a paused question in its original position.
  const cursor = before?.startsWith("t2:") ? before.slice(3) : before;
  const boundary =
    !before || before.startsWith("t2:")
      ? cursor
      : String(
          (
            await db().execute({
              sql: "SELECT t.seq FROM ai_conversation_turns t JOIN ai_prompt_chats c ON c.id=t.final_chat_id WHERE c.rowid=? AND t.workspace_id=? AND t.user_id=? AND t.conv_id=?",
              args: [before, user.workspaceId, user.id, convId],
            })
          ).rows[0]?.seq ?? 0,
        );
  const result = await db().execute({
    sql: `SELECT t.seq AS cursor,t.turn_id,t.status AS turn_status,t.version AS turn_version,t.prompt_excerpt,t.created_at AS turn_created_at,(SELECT a.id FROM ai_guardrail_approvals a WHERE a.turn_id=t.turn_id ORDER BY a.rowid DESC LIMIT 1) AS approval_id,c.id,t.conv_id AS convId,c.prompt,c.model,c.screen_title AS screenTitle,c.created_at AS createdAt,c.result,c.rag_references_json,c.target_page AS targetPage,c.target_version AS targetVersion,c.provenance_json,c.shared_answer_id,c.shared_answer_version FROM ai_conversation_turns t LEFT JOIN ai_prompt_chats c ON c.id=t.final_chat_id WHERE t.workspace_id=? AND t.user_id=? AND t.project_id IS ? AND t.conv_id=? AND (t.final_chat_id IS NOT NULL OR EXISTS(SELECT 1 FROM ai_guardrail_approvals a WHERE a.turn_id=t.turn_id)) ${before ? "AND t.seq < ?" : ""} ORDER BY t.seq DESC LIMIT 11`,
    args: [
      user.workspaceId,
      user.id,
      projectId || null,
      convId,
      ...(before ? [boundary!] : []),
    ],
  });
  const hasMore = result.rows.length > 10;
  const rows = result.rows.slice(0, 10).reverse();
  const sharedOrigins = new Map();
  for (const row of rows)
    if (row.shared_answer_id) {
      const origin = await sharedHistoryOrigin(
        user,
        projectId,
        String(row.shared_answer_id),
        Number(row.shared_answer_version),
      );
      sharedOrigins.set(String(row.id), origin);
      if (origin.unavailable) {
        row.result = "현재 열람할 수 없는 공유 답변입니다.";
        row.rag_references_json = "[]";
      }
    }
  const completed = rows.filter((row) => row.id !== null);
  const ids = completed.map((row) => String(row.id));
  const attachments = ids.length
    ? await db().execute({
        sql: `SELECT id,chat_id,mime_type,byte_length,width,height FROM ai_chat_images WHERE workspace_id=? AND user_id=? AND chat_id IN (${ids.map(() => "?").join(",")}) ORDER BY position`,
        args: [user.workspaceId, user.id, ...ids],
      })
    : { rows: [] };
  const reviews = ids.length
    ? (
        await db().execute({
          sql: `SELECT * FROM ai_change_reviews WHERE workspace_id=? AND user_id=? AND chat_id IN (${ids.map(() => "?").join(",")})`,
          args: [user.workspaceId, user.id, ...ids],
        })
      ).rows
    : [];
  return {
    turns: rows.map((row) => ({
      id: String(row.turn_id),
      seq: Number(row.cursor),
      version: Number(row.turn_version),
      status: String(row.turn_status),
      promptExcerpt: String(row.prompt_excerpt),
      createdAt: String(row.turn_created_at),
      chatId: row.id === null ? null : String(row.id),
      approvalId: row.approval_id === null ? null : String(row.approval_id),
    })),
    chats: completed.map((row) => ({
      turnId: String(row.turn_id),
      turnSeq: Number(row.cursor),
      responseSource: row.shared_answer_id
        ? ("shared_answer" as const)
        : ("generated" as const),
      sharedAnswer: sharedOrigins.get(String(row.id)),
      shareEligibility: {
        eligible:
          !row.shared_answer_id &&
          parseProvenance(row.provenance_json)?.complete === true,
        reason:
          parseProvenance(row.provenance_json)?.reason ??
          "근거 추적 정보가 없는 과거 답변입니다.",
      },
      id: String(row.id),
      convId: String(row.convId),
      review: reviews.find((r) => r.chat_id === row.id)
        ? reviewInfo(reviews.find((r) => r.chat_id === row.id)!)
        : undefined,
      prompt: String(row.prompt),
      model: String(row.model),
      screenTitle: String(row.screenTitle),
      createdAt: String(row.createdAt),
      result: String(row.result),
      references: JSON.parse(String(row.rag_references_json ?? "[]")),
      targetPage: isAiTargetPage(row.targetPage) ? row.targetPage : null,
      targetVersion:
        row.targetVersion === null ? null : Number(row.targetVersion),
      images: attachments.rows
        .filter((image) => image.chat_id === row.id)
        .map(imageInfo),
    })),
    nextCursor: hasMore ? `t2:${rows[0].cursor}` : null,
  };
}
export async function conversationHistory(
  user: User,
  projectId: string,
  convId: string,
  options: {
    ids?: string[];
    beforeSeq?: number;
    captureIds?: (ids: string[]) => void;
    executor?: Pick<Client, "execute">;
  } = {},
) {
  if (!(await workspacePlan(user.id, user.workspaceId)).historyEnabled)
    return [];
  const executor = options.executor ?? db();
  if (options.ids?.length === 0) {
    options.captureIds?.([]);
    return [];
  }
  const result = await executor.execute({
    sql: `SELECT c.id,c.prompt,c.result,c.shared_answer_id,c.shared_answer_version FROM ai_prompt_chats c JOIN ai_conversation_turns t ON t.final_chat_id=c.id WHERE c.workspace_id=? AND c.user_id=? AND c.project_id IS ? AND c.conv_id=? AND t.status='completed' ${options.ids ? `AND c.id IN (${options.ids.map(() => "?").join(",")})` : ""} ${options.beforeSeq ? "AND t.seq < ?" : ""} ORDER BY t.seq DESC LIMIT 20`,
    args: [
      user.workspaceId,
      user.id,
      projectId || null,
      convId,
      ...(options.ids ?? []),
      ...(options.beforeSeq ? [options.beforeSeq] : []),
    ],
  });
  if (options.ids && result.rows.length !== options.ids.length)
    throw new HttpError(
      409,
      "이전 대화가 변경되었습니다. 새 요청이 필요합니다.",
      { code: "GUARDRAIL_APPROVAL_INVALIDATED" },
    );
  for (const row of result.rows)
    if (row.shared_answer_id) {
      const origin = await sharedHistoryOrigin(
        user,
        projectId,
        String(row.shared_answer_id),
        Number(row.shared_answer_version),
      );
      if (origin.unavailable)
        row.result = "현재 열람할 수 없는 공유 답변입니다.";
      else if (origin.stale)
        row.result =
          "과거 공유 답변의 근거가 변경되어 새 질문의 근거로 제공하지 않습니다.";
    }
  let remaining = 60000;
  const selected = [];
  for (const row of result.rows) {
    const size = String(row.prompt).length + String(row.result).length;
    if (selected.length && size > remaining) break;
    selected.push(row);
    remaining -= size;
  }
  options.captureIds?.(selected.map((row) => String(row.id)));
  // Include the latest three historic captures, decrypted only on the server.
  const images = selected.length
    ? await executor.execute({
        sql: `SELECT * FROM ai_chat_images WHERE workspace_id=? AND user_id=? AND chat_id IN (${selected.map(() => "?").join(",")}) ORDER BY rowid DESC LIMIT 3`,
        args: [
          user.workspaceId,
          user.id,
          ...selected.map((row) => String(row.id)),
        ],
      })
    : { rows: [] };
  const reviewStates = (
    await executor.execute({
      sql: "SELECT chat_id,status,applied_actions_json FROM ai_change_reviews WHERE conv_id=? AND workspace_id=? AND user_id=?",
      args: [convId, user.workspaceId, user.id],
    })
  ).rows;
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
      {
        role: "assistant",
        content:
          String(row.result).slice(0, 60000) +
          reviewStates
            .filter((r) => r.chat_id === row.id)
            .map(
              (r) =>
                `\n[?? ?? ?? ??: ${r.status}; applied? ?? ??. ?? ??: ${r.applied_actions_json}]`,
            )
            .join(""),
      },
    ];
  });
}

export async function validateFrozenHistory(
  user: User,
  projectId: string,
  convId: string,
  context: NonNullable<ExecutionJournal["historyContext"]>,
  executor?: Pick<Client, "execute">,
) {
  const messages = await conversationHistory(user, projectId, convId, {
    ids: context.ids,
    executor,
  });
  if (
    executionHash(messages) !== context.hash ||
    executionHash(context.messages) !== context.hash
  )
    throw new HttpError(
      409,
      "이전 대화 또는 첨부가 변경되었습니다. 새 요청이 필요합니다.",
      { code: "GUARDRAIL_APPROVAL_INVALIDATED" },
    );
}

export function temporaryHistory(value: unknown): Record<string, unknown>[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20)
    throw new HttpError(400, "임시 대화 문맥이 너무 깁니다.");
  let size = 0;
  return value.map((message) => {
    if (
      !message ||
      typeof message !== "object" ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string"
    )
      throw new HttpError(400, "임시 대화 형식이 올바르지 않습니다.");
    size += message.content.length;
    if (size > 60000)
      throw new HttpError(400, "임시 대화 문맥은 60,000자 이내여야 합니다.");
    return { role: message.role, content: message.content };
  });
}
