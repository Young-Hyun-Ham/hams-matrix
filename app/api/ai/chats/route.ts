import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  rateLimit,
  requireUser,
} from "@/lib/auth";
import { workspacePlan } from "@/lib/plans";
import { db } from "@/lib/db";
import { projectTabLabels, type ProjectTab } from "@/lib/project-tabs";
import { aiModels, generateAi } from "@/lib/ai-server";
import { pageInstructions } from "@/lib/ai/page-prompts";
import { targetFromLocation } from "@/lib/ai-target-pages";
import { validateTarget, targetAiPage } from "@/lib/ai/resolve-target";
import {
  ConversationTargetConflict,
  saveConversationTarget,
  targetVersion,
} from "@/lib/ai/conversation-targets";
import { readAiPage } from "@/lib/ai/page-data";
import { createPageAgent, type AiAction } from "@/lib/ai/page-tools";
import { encryptAiImages, validateAiImages } from "@/lib/ai/chat-images";
import { createTokenTracker } from "@/lib/ai/token-usage";
import {
  activeGuardrailPolicy,
  assertAiEnabled,
} from "@/lib/ai/guardrail-policy";
import { createGuardrailSession, GuardrailBlocked } from "@/lib/ai/guardrails";
import {
  GenerationCancelled,
  GenerationStopFailed,
  generationRequestId,
  registerGeneration,
  generationCheckpoint,
} from "@/lib/ai/generation-control";
import {
  conversationId,
  requireConversation,
  conversationChats,
  conversationHistory,
  temporaryHistory,
} from "@/lib/ai/conversations";
export const maxDuration = 180;
export async function GET(request: Request) {
  try {
    const user = await requireUser(),
      projectId = new URL(request.url).searchParams.get("projectId") || "";
    const params = new URL(request.url).searchParams;
    const convId = conversationId(params.get("convId"));
    const before = params.get("before") || undefined;
    if (before && !/^\d{1,18}$/.test(before))
      throw new HttpError(400, "Invalid cursor");
    const conversation = await requireConversation(user, projectId, convId);
    return Response.json(
      {
        conversation,
        ...(await conversationChats(user, projectId, convId, before)),
        historyEnabled: (await workspacePlan(user.id, user.workspaceId)).historyEnabled,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  let lease: { convId: string; requestId: string } | undefined;
  let generationId: string | undefined;
  let outcome = "failed";
  let actions: AiAction[] = [];
  const requestDeadline = Date.now() + 140000;
  try {
    checkOrigin(request);
    const user = await requireUser(),
      input = await body(request, 15 * 1024 * 1024);
    const plan = await workspacePlan(user.id, user.workspaceId);
    const images = validateAiImages(input.images, plan.attachmentLimit);
    const prompt =
      (typeof input.prompt === "string" ? input.prompt.trim() : "") ||
      (images.length
        ? "첨부한 캡처 이미지를 선택한 AI 대상에 맞게 분석해줘"
        : "");
    if (!prompt || prompt.length > 2000)
      throw new HttpError(400, "요청 내용을 1~2,000자로 입력해 주세요.");
    const model = typeof input.model === "string" ? input.model : "";
    const projectId =
      typeof input.projectId === "string" ? input.projectId : "";
    const source = (input.sourceContext ?? input) as Record<string, unknown>;
    const sourceTarget = targetFromLocation(
      projectId,
      source.pathname,
      source.tab,
    );
    if (!sourceTarget)
      throw new HttpError(400, "현재 화면 정보를 확인해 주세요.");
    const pathname = source.pathname as string;
    const sourceTab = projectId
      ? typeof source.tab === "string"
        ? (source.tab as ProjectTab)
        : null
      : null;
    const convId = conversationId(input.convId);
    let conversation = await requireConversation(user, projectId, convId);
    const explicitTarget = Object.hasOwn(input, "targetPage");
    const requestedTarget = explicitTarget ? input.targetPage : sourceTarget;
    const expectedVersion = explicitTarget
      ? targetVersion(input.expectedTargetVersion)
      : (conversation.targetVersion ?? 0);
    if (plan.historyEnabled) {
      if (!conversation.targetPage) {
        conversation = await saveConversationTarget(
          user,
          projectId,
          convId,
          requestedTarget,
          expectedVersion,
        );
      } else if (
        requestedTarget !== conversation.targetPage ||
        expectedVersion !== conversation.targetVersion
      ) {
        throw new ConversationTargetConflict(conversation);
      }
    }
    const resolved = await validateTarget(
      user,
      projectId,
      plan.historyEnabled ? conversation.targetPage : requestedTarget,
    );
    const context = resolved.context;
    const projectName = context.projectName;
    const tab = context.tab;
    let canWrite = resolved.canWrite;
    const executionTarget = resolved.targetPage;
    const executionVersion = plan.historyEnabled
      ? (conversation.targetVersion ?? 0)
      : expectedVersion;
    if (!plan.historyEnabled)
      conversation = {
        ...conversation,
        targetPage: executionTarget,
        targetVersion: executionVersion,
      };
    const guardrail = await activeGuardrailPolicy(user.workspaceId);
    await assertAiEnabled(user.workspaceId);
    if (!(await aiModels()).includes(model))
      throw new HttpError(400, "사용 가능한 AI 모델을 선택해 주세요.");
    await rateLimit(`ai:${user.workspaceId}:${user.id}`, 20);
    const id = randomUUID();
    // 생성 요청 전에 암호화 키/이미지를 검증하여 저장 불가 상태의 유료 호출을 방지합니다.
    const encrypted = plan.historyEnabled
      ? encryptAiImages(images, {
          chatId: id,
          workspaceId: user.workspaceId,
          userId: user.id,
          projectId,
        })
      : {
          statements: [],
          images: images.map((image, index) => ({
            id: `${id}-${index}`,
            url: image.dataUrl,
            mimeType: "image/png",
            byteLength: image.bytes.length,
            width: image.width,
            height: image.height,
          })),
        };
    const page = targetAiPage(executionTarget);
    const requestId =
      input.requestId === undefined
        ? randomUUID()
        : generationRequestId(input.requestId);
    await registerGeneration(user, convId, requestId);
    generationId = requestId;
    const generationCheck = generationCheckpoint(requestId, request.signal);
    const checkpoint = async (executor?: Pick<Client, "execute">) => {
      await generationCheck(executor);
      if (Date.now() >= requestDeadline)
        throw new HttpError(504, "AI 요청의 전체 처리 시간이 초과되었습니다.");
      await assertAiEnabled(user.workspaceId, executor);
    };
    await db().execute({
      sql: "UPDATE ai_generation_requests SET guardrail_version=?,target_page=?,target_version=? WHERE request_id=?",
      args: [guardrail.version, executionTarget, executionVersion, requestId],
    });
    await checkpoint();
    const locked = plan.historyEnabled
      ? await db().execute({
          sql: "UPDATE ai_conversations SET request_id=?,busy_until=? WHERE conv_id=? AND workspace_id=? AND user_id=? AND project_id IS ? AND (request_id IS NULL OR busy_until < ?) AND target_page=? AND target_version=? RETURNING conv_id",
          args: [
            requestId,
            new Date(Date.now() + 240000).toISOString(),
            convId,
            user.workspaceId,
            user.id,
            projectId || null,
            new Date().toISOString(),
            executionTarget,
            executionVersion,
          ],
        })
      : { rows: [] };
    if (plan.historyEnabled && !locked.rows.length)
      throw new ConversationTargetConflict(
        await requireConversation(user, projectId, convId),
      );
    lease = plan.historyEnabled ? { convId, requestId } : undefined;
    const track = createTokenTracker({
      workspaceId: user.workspaceId,
      userId: user.id,
      projectId,
      projectName,
      convId,
      conversationTitle: conversation.title,
      chatId: id,
      requestId,
      model,
      prompt,
    });
    const guard = createGuardrailSession({
      workspaceId: user.workspaceId,
      userId: user.id,
      requestId,
      version: guardrail.version,
      policy: guardrail.policy,
      checkpoint,
      track,
      deadline: requestDeadline,
    });
    await guard.inspect("input", prompt, images);
    const history = plan.historyEnabled
      ? await conversationHistory(user, projectId, convId)
      : temporaryHistory(input.history);
    const pageContext = await readAiPage(user, context, page);
    const historyImages: { dataUrl: string }[] = [];
    const historyText = history.map((message) => ({
      ...message,
      content: Array.isArray(message.content)
        ? message.content.map((part: Record<string, unknown>) => {
            if (
              part.type !== "input_image" ||
              typeof part.image_url !== "string"
            )
              return part;
            historyImages.push({ dataUrl: part.image_url });
            return { type: "input_image", source: "previous_attachment" };
          })
        : message.content,
    }));
    await guard.inspect(
      "context",
      { projectName, history: historyText, pageContext },
      historyImages,
    );
    if (
      (images.length || historyImages.length) &&
      guardrail.policy.imageMode === "read-only"
    )
      canWrite = false;
    const agent = createPageAgent(
      request,
      user,
      context,
      page,
      canWrite,
      prompt,
      checkpoint,
      { policy: guardrail.policy, inspect: guard.inspect },
      "domainMeta" in pageContext
        ? pageContext.domainMeta?.catalogRevision
        : undefined,
    );
    actions = agent.actions;
    let result: string;
    try {
      result = await generateAi(
        model,
        pageInstructions(context, page, canWrite),
        JSON.stringify({ pageContext, request: prompt }),
        agent,
        images,
        history,
        track,
        checkpoint,
        {
          deadline: requestDeadline,
          maxToolRounds: guardrail.policy.maxToolRounds,
          requestId,
        },
      );
    } catch (error) {
      if (error instanceof GenerationStopFailed) throw error;
      if (error instanceof GenerationCancelled) {
        outcome = "cancelled";
        return Response.json(
          { cancelled: true, actions: agent.actions, projectId },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      // Tool mutations are only previews until the final output has passed validation.
      throw error;
    }
    await guard.inspect("output", result);
    await checkpoint();
    // Atomic boundary: either stop wins, or the completed result is committed.
    const finalizing = await db().execute({
      sql: "UPDATE ai_generation_requests SET status='finalizing' WHERE request_id=? AND status='running' RETURNING request_id",
      args: [requestId],
    });
    if (!finalizing.rows.length) {
      outcome = "cancelled";
      return Response.json(
        { cancelled: true, actions: agent.actions, projectId },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const createdAt = new Date().toISOString(),
      screenTitle = [
        projectName || context.screen,
        tab ? projectTabLabels[tab] : "",
      ]
        .filter(Boolean)
        .join(" · ");
    const saveTx = await db().transaction("write");
    let committed: AiAction[] = [];
    try {
      committed = await agent.commit(saveTx);
      if (committed.length)
        result +=
          "\n\n[서버 확인 실행 결과]\n" +
          committed
            .map(
              (a) => `${a.action} · ${a.code} · ${a.title} · 버전 ${a.version}`,
            )
            .join("\n");
      const statements = plan.historyEnabled
        ? [
            {
              sql: "INSERT INTO ai_prompt_chats(id,workspace_id,user_id,project_id,pathname,tab,screen_title,prompt,model,result,created_at,conv_id,target_page,target_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              args: [
                id,
                user.workspaceId,
                user.id,
                projectId || null,
                pathname,
                sourceTab,
                screenTitle,
                prompt,
                model,
                result,
                createdAt,
                convId,
                executionTarget,
                executionVersion,
              ],
            },
            ...encrypted.statements,
            {
              sql: "UPDATE ai_token_usage SET chat_saved=1,result_characters=? WHERE request_id=? AND workspace_id=? AND user_id=?",
              args: [
                Array.from(result).length,
                requestId,
                user.workspaceId,
                user.id,
              ],
            },
            {
              sql: "UPDATE ai_conversations SET updated_at=? WHERE conv_id=? AND workspace_id=? AND user_id=?",
              args: [createdAt, convId, user.workspaceId, user.id],
            },
          ]
        : [];
      for (const statement of statements) await saveTx.execute(statement);
      await checkpoint(saveTx);
      await saveTx.commit();
      agent.actions.push(...committed);
    } catch (error) {
      await saveTx.rollback();
      throw error;
    } finally {
      saveTx.close();
    }
    outcome = "completed";
    return Response.json(
      {
        chat: {
          id,
          convId,
          createdAt,
          screenTitle,
          prompt,
          model,
          result,
          images: encrypted.images,
          targetPage: executionTarget,
          targetVersion: executionVersion,
        },
        conversation,
        actions: agent.actions,
        projectId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ConversationTargetConflict)
      return Response.json(
        { error: error.message, conversation: error.conversation },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof GuardrailBlocked)
      return Response.json(
        { error: error.message, requestId: error.requestId },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof GenerationStopFailed)
      return Response.json(
        { error: error.message, stopUnconfirmed: true, actions },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    if (error instanceof GenerationCancelled) {
      outcome = "cancelled";
      return Response.json(
        { cancelled: true, actions },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return errorResponse(error);
  } finally {
    if (generationId)
      await db().execute({
        sql: "UPDATE ai_generation_requests SET status=?,actions_json=?,finished_at=? WHERE request_id=?",
        args: [
          outcome,
          JSON.stringify(actions),
          new Date().toISOString(),
          generationId,
        ],
      });
    if (lease)
      await db().execute({
        sql: "UPDATE ai_conversations SET request_id=NULL,busy_until=NULL WHERE conv_id=? AND request_id=?",
        args: [lease.convId, lease.requestId],
      });
  }
}
