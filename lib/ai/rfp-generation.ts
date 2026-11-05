import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import { db } from "../db";
import { HttpError, rateLimit } from "../auth";
import type { User } from "../types";
import { requireProjectPermission } from "../project-permissions";
import { readRfp, mutateRfp, validateRfp } from "../rfp-server";
import {
  assertRfpSourceIdle,
  expireRfpGenerations,
  rfpSourceRow,
  rfpSourceExtension,
  sourceVersion,
} from "../rfp-sources";
import {
  RFP_SOURCE_MAX_BYTES,
  RFP_GENERATION_PROMPT_MAX_LENGTH,
  type RfpGeneration,
} from "../rfp-source-types";
import { getDocument } from "../r2";
import { extractDocumentText } from "../document-text";
import { aiModels, generateAi } from "../ai-server";
import { activeGuardrailPolicy, assertAiEnabled } from "./guardrail-policy";
import { createGuardrailSession } from "./guardrails";
import { createTokenTracker } from "./token-usage";
import {
  GenerationCancelled,
  GenerationStopFailed,
  generationRequestId,
} from "./generation-control";
import { activeResponse, retrieveResponse } from "./background-response";
import {
  rfpGenerationInstructions,
  rfpResponseFormat,
} from "./rfp-generation-prompt";
import type { GuardrailPolicy } from "./guardrail-types";

type Executor = Pick<Client, "execute">;
function dto(row: Row): RfpGeneration {
  return {
    requestId: String(row.request_id),
    status: row.status as RfpGeneration["status"],
    documentId: row.document_id === null ? null : String(row.document_id),
    documentVersion:
      row.document_version === null ? null : Number(row.document_version),
    errorCode: row.error_code === null ? null : Number(row.error_code),
  };
}
async function ownedRequest(
  executor: Executor,
  user: User,
  projectId: string,
  requestId: string,
) {
  const row = (
    await executor.execute({
      sql: "SELECT * FROM project_rfp_generation_requests WHERE request_id=? AND workspace_id=? AND project_id=? AND user_id=?",
      args: [requestId, user.workspaceId, projectId, user.id],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "생성 요청을 찾을 수 없습니다.");
  return row;
}
export async function rfpGenerationStatus(
  user: User,
  projectId: string,
  requestId: string,
  stop = false,
) {
  generationRequestId(requestId);
  await requireProjectPermission(db(), user, projectId, "documents", "READ");
  await requireProjectPermission(db(), user, projectId, "rfp", "READ");
  await ownedRequest(db(), user, projectId, requestId);
  await expireRfpGenerations(db(), user.workspaceId, projectId);
  if (stop) {
    await db().execute({
      sql: "UPDATE project_rfp_generation_requests SET status='stop_requested' WHERE request_id=? AND user_id=? AND workspace_id=? AND project_id=? AND status='running'",
      args: [requestId, user.id, user.workspaceId, projectId],
    });
    const pending = await ownedRequest(db(), user, projectId, requestId);
    if (
      pending.status === "stop_requested" &&
      Number(pending.error_code) === 502
    ) {
      try {
        const calls = (
          await db().execute({
            sql: "SELECT * FROM ai_token_usage WHERE request_id=? AND workspace_id=? AND user_id=? AND usage_final=0 AND response_id IS NOT NULL",
            args: [requestId, user.workspaceId, user.id],
          })
        ).rows;
        const track = createTokenTracker({
          workspaceId: user.workspaceId,
          userId: user.id,
          projectId,
          projectName: "",
          convId: `rfp-file:${projectId}`,
          conversationTitle: "파일 기반 제안요청서 생성",
          chatId: requestId,
          requestId,
          model: String(pending.model),
          prompt: "",
        });
        for (const call of calls) {
          const response = await retrieveResponse(
            String(call.response_id),
            true,
          );
          await track({
            turn: Number(call.call_index),
            status: String(response.status),
            model: String(response.model ?? call.model),
            responseId: String(call.response_id),
            usage: response.usage,
            purpose: call.purpose === "guardrail" ? "guardrail" : "generation",
          });
          if (activeResponse(response.status)) throw new GenerationStopFailed();
        }
        await db().execute({
          sql: "UPDATE project_rfp_generation_requests SET status='cancelled',error_code=NULL,finished_at=? WHERE request_id=? AND status='stop_requested'",
          args: [new Date().toISOString(), requestId],
        });
      } catch {
        throw new GenerationStopFailed();
      }
    }
  }
  const row = await ownedRequest(db(), user, projectId, requestId);
  const saved =
    row.status === "completed"
      ? (await readRfp(db(), user, projectId)).document
      : null;
  return {
    generation: dto(row),
    document:
      saved?.id === row.document_id &&
      saved?.version === Number(row.document_version)
        ? saved
        : null,
  };
}
function allowed(policy: GuardrailPolicy, action: "CREATE" | "UPDATE") {
  if (
    !policy.aiEnabled ||
    !policy.allowedActions.includes(action) ||
    policy.maxChanges < 1
  )
    throw new HttpError(
      403,
      "관리자 AI 정책에서 제안요청서 생성을 허용하지 않습니다.",
    );
}
export async function generateRfpFromSource(
  request: Request,
  user: User,
  projectId: string,
  input: Record<string, unknown>,
) {
  const keys = [
    "requestId",
    "sourceFileId",
    "expectedSourceVersion",
    "model",
    "documentId",
    "expectedVersion",
    "prompt",
  ];
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new HttpError(400, "허용되지 않은 생성 입력입니다.");
  if (
    input.prompt !== undefined &&
    (typeof input.prompt !== "string" ||
      input.prompt.length > RFP_GENERATION_PROMPT_MAX_LENGTH)
  )
    throw new HttpError(
      400,
      `생성 요청 범위는 ${RFP_GENERATION_PROMPT_MAX_LENGTH.toLocaleString()}자 이하로 입력해 주세요.`,
    );
  const scopePrompt =
    typeof input.prompt === "string" ? input.prompt.trim() : "";
  const requestId = generationRequestId(input.requestId),
    version = sourceVersion(input.expectedSourceVersion);
  if (
    typeof input.sourceFileId !== "string" ||
    !input.sourceFileId ||
    typeof input.model !== "string" ||
    !input.model ||
    input.model.length > 200
  )
    throw new HttpError(400, "원본 파일과 AI 모델을 확인해 주세요.");
  if (
    input.documentId !== null &&
    (typeof input.documentId !== "string" || !input.documentId)
  )
    throw new HttpError(400, "기준 문서를 확인해 주세요.");
  if (
    input.documentId === null
      ? input.expectedVersion !== null
      : !Number.isSafeInteger(input.expectedVersion) ||
        Number(input.expectedVersion) < 1
  )
    throw new HttpError(400, "기준 문서 버전을 확인해 주세요.");
  const canonical = JSON.stringify({
    sourceFileId: input.sourceFileId,
    expectedSourceVersion: version,
    model: input.model,
    documentId: input.documentId,
    expectedVersion: input.expectedVersion,
    ...(scopePrompt ? { prompt: scopePrompt } : {}),
  });
  await requireProjectPermission(db(), user, projectId, "rfp", "READ");
  await requireProjectPermission(db(), user, projectId, "documents", "READ");
  const prior = (
    await db().execute({
      sql: "SELECT * FROM project_rfp_generation_requests WHERE request_id=?",
      args: [requestId],
    })
  ).rows[0];
  if (prior) {
    if (
      prior.user_id !== user.id ||
      prior.workspace_id !== user.workspaceId ||
      prior.project_id !== projectId
    )
      throw new HttpError(404, "생성 요청을 찾을 수 없습니다.");
    if (prior.input_json !== canonical)
      throw new HttpError(
        409,
        "같은 요청 ID에 다른 입력을 사용할 수 없습니다.",
      );
    return rfpGenerationStatus(user, projectId, requestId);
  }
  const action = input.documentId === null ? "CREATE" : "UPDATE";
  await requireProjectPermission(db(), user, projectId, "rfp", action);
  const policy = await activeGuardrailPolicy(user.workspaceId);
  allowed(policy.policy, action);
  if (!(await aiModels()).includes(input.model))
    throw new HttpError(400, "사용 가능한 AI 모델을 선택해 주세요.");
  await rateLimit(`ai:${user.workspaceId}:${user.id}`, 20);
  const checkBase = async (executor: Executor) => {
    await requireProjectPermission(executor, user, projectId, "rfp", action);
    await requireProjectPermission(
      executor,
      user,
      projectId,
      "documents",
      "READ",
    );
    const source = await rfpSourceRow(executor, user, projectId),
      document = (await readRfp(executor, user, projectId)).document;
    if (
      !source?.file_id ||
      source.file_id !== input.sourceFileId ||
      Number(source.version) !== version
    )
      throw new HttpError(
        409,
        "원본 연결이 변경되었습니다. 최신 내용을 조회해 주세요.",
      );
    if (
      (document?.id ?? null) !== input.documentId ||
      (document?.version ?? null) !== input.expectedVersion
    )
      throw new HttpError(
        409,
        "제안요청서가 변경되었습니다. 최신 내용을 조회해 주세요.",
      );
    return source;
  };
  const deadline = Date.now() + 140000,
    tx = await db().transaction("write");
  let source: Row;
  try {
    const replay = (
      await tx.execute({
        sql: "SELECT * FROM project_rfp_generation_requests WHERE request_id=?",
        args: [requestId],
      })
    ).rows[0];
    if (replay) {
      if (
        replay.user_id !== user.id ||
        replay.workspace_id !== user.workspaceId ||
        replay.project_id !== projectId
      )
        throw new HttpError(404, "생성 요청을 찾을 수 없습니다.");
      if (replay.input_json !== canonical)
        throw new HttpError(
          409,
          "같은 요청 ID에 다른 입력을 사용할 수 없습니다.",
        );
      await tx.commit();
      return rfpGenerationStatus(user, projectId, requestId);
    }
    await assertRfpSourceIdle(tx, user, projectId);
    source = await checkBase(tx);
    const now = new Date().toISOString();
    await tx.execute({
      sql: `INSERT INTO project_rfp_generation_requests(request_id,workspace_id,project_id,user_id,input_json,status,source_file_id,source_version,source_key,source_name,source_size,model,guardrail_version,created_at,lease_until)
      VALUES (?,?,?,?,?,'running',?,?,?,?,?,?,?,?,?)`,
      args: [
        requestId,
        user.workspaceId,
        projectId,
        user.id,
        canonical,
        String(source.file_id),
        version,
        String(source.object_key),
        String(source.name),
        Number(source.byte_length),
        input.model,
        policy.version,
        now,
        new Date(deadline + 60000).toISOString(),
      ],
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
  const checkpoint = async (executor: Executor = db()) => {
    const row = await ownedRequest(executor, user, projectId, requestId);
    if (
      request.signal.aborted ||
      row.status === "stop_requested" ||
      row.status === "cancelled"
    )
      throw new GenerationCancelled();
    if (
      row.status !== "running" ||
      String(row.lease_until) <= new Date().toISOString() ||
      Date.now() >= deadline
    )
      throw new HttpError(
        504,
        "AI 생성 시간이 초과되었습니다. 다시 시도해 주세요.",
      );
    await assertAiEnabled(user.workspaceId, executor);
  };
  try {
    await checkpoint();
    if (Number(source.byte_length) > RFP_SOURCE_MAX_BYTES)
      throw new HttpError(
        413,
        "원본은 최대 20MB까지 분석할 수 있습니다. 파일을 교체해 주세요.",
      );
    const bytes = Buffer.from(await getDocument(String(source.object_key)));
    if (
      bytes.length !== Number(source.byte_length) ||
      bytes.length > RFP_SOURCE_MAX_BYTES
    )
      throw new HttpError(409, "원본 파일 크기가 변경되었습니다.");
    const text = await extractDocumentText(
      bytes,
      rfpSourceExtension(String(source.name)),
      request.signal,
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    await db().execute({
      sql: "UPDATE project_rfp_generation_requests SET source_hash=?,characters=? WHERE request_id=? AND status='running'",
      args: [hash, text.length, requestId],
    });
    const prompt =
      "첨부 원본을 제안요청서로 작성하여 DB 초안으로 저장합니다." +
      (scopePrompt ? `\n사용자 요청 범위: ${scopePrompt}` : "");
    const track = createTokenTracker({
      workspaceId: user.workspaceId,
      userId: user.id,
      projectId,
      projectName: "",
      convId: `rfp-file:${projectId}`,
      conversationTitle: "파일 기반 제안요청서 생성",
      chatId: requestId,
      requestId,
      model: input.model,
      prompt,
    });
    // const guard=createGuardrailSession({workspaceId:user.workspaceId,userId:user.id,requestId,version:policy.version,policy:policy.policy,checkpoint,track,deadline});
    // await guard.inspect("input",prompt);
    const context = {
      requestScope: scopePrompt,
      fileName: String(source.name),
      untrustedSourceText: text,
    };
    // await guard.inspect("context",context);
    const result = await generateAi(
      input.model,
      rfpGenerationInstructions,
      JSON.stringify(context),
      undefined,
      [],
      [],
      track,
      checkpoint,
      { deadline, responseFormat: rfpResponseFormat() },
    );
    // await guard.inspect("output",result);
    let parsed: Record<string, unknown>;
    try {
      const envelope = JSON.parse(result);
      if (
        envelope?.complete !== true ||
        !envelope.document ||
        typeof envelope.document !== "object" ||
        Array.isArray(envelope.document) ||
        Object.keys(envelope).some(
          (key) => !["complete", "document"].includes(key),
        )
      )
        throw new Error();
      parsed = envelope.document;
    } catch {
      throw new HttpError(
        502,
        "AI 문서가 완성되지 않았습니다. 기존 문서는 유지됩니다.",
      );
    }
    const normalized: Record<string, unknown> = {
      ...parsed,
      projectId,
      schemaVersion: 1,
    };
    for (const key of ["requirements", "evaluation"] as const) {
      const rows = normalized[key];
      if (Array.isArray(rows))
        (normalized as Record<string, unknown>)[key] = rows.map((row) =>
          row && typeof row === "object" && !Array.isArray(row)
            ? { ...row, id: randomUUID() }
            : row,
        );
    }
    const delivery = normalized.delivery as Record<string, unknown> | undefined;
    if (
      delivery &&
      typeof delivery === "object" &&
      Array.isArray(delivery.schedule)
    )
      delivery.schedule = delivery.schedule.map((row) =>
        row && typeof row === "object" && !Array.isArray(row)
          ? { ...row, id: randomUUID() }
          : row,
      );
    const draft = validateRfp(normalized, projectId);
    // await guard.inspect("output",draft);
    await checkpoint();
    const save = await db().transaction("write");
    try {
      await checkpoint(save);
      const current = await checkBase(save);
      if (
        current.object_key !== source.object_key ||
        current.name !== source.name ||
        Number(current.byte_length) !== Number(source.byte_length)
      )
        throw new HttpError(
          409,
          "생성 중 원본 파일이 변경되었습니다. 다시 생성해 주세요.",
        );
      allowed(
        (await activeGuardrailPolicy(user.workspaceId, save)).policy,
        action,
      );
      allowed(policy.policy, action);
      await save.execute({
        sql: "UPDATE project_rfp_generation_requests SET status='finalizing' WHERE request_id=? AND status='running'",
        args: [requestId],
      });
      const document = await mutateRfp(
        request,
        user,
        projectId,
        {
          id: input.documentId ?? undefined,
          expectedVersion: input.expectedVersion ?? undefined,
          draft,
        },
        action,
        save,
      );
      await save.execute({
        sql: "UPDATE project_rfp_generation_requests SET status='completed',document_id=?,document_version=?,finished_at=? WHERE request_id=?",
        args: [
          document.id,
          document.version,
          new Date().toISOString(),
          requestId,
        ],
      });
      await save.commit();
      return {
        generation: {
          requestId,
          status: "completed" as const,
          documentId: document.id,
          documentVersion: document.version,
          errorCode: null,
        },
        document,
      };
    } catch (error) {
      await save.rollback();
      throw error;
    } finally {
      save.close();
    }
  } catch (error) {
    if (error instanceof GenerationStopFailed) {
      await db().execute({
        sql: "UPDATE project_rfp_generation_requests SET status='stop_requested',error_code=502 WHERE request_id=? AND status IN ('running','stop_requested')",
        args: [requestId],
      });
      throw error;
    }
    const cancelled =
      error instanceof GenerationCancelled || request.signal.aborted;
    await db().execute({
      sql: "UPDATE project_rfp_generation_requests SET status=?,error_code=?,finished_at=? WHERE request_id=? AND status IN ('running','stop_requested')",
      args: [
        cancelled ? "cancelled" : "failed",
        cancelled ? null : error instanceof HttpError ? error.status : 500,
        new Date().toISOString(),
        requestId,
      ],
    });
    if (cancelled) return rfpGenerationStatus(user, projectId, requestId);
    throw error;
  }
}
