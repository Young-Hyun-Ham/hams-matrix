import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import { db } from "../db";
import { HttpError, rateLimit } from "../auth";
import type { User } from "../types";
import { projectData } from "../artifacts";
import { requireProjectPermission } from "../project-permissions";
import {
  captureSource,
  persistCapturedSource,
  verifyCapturedSources,
  type CapturedSource,
} from "../source-capture";
import { getDocument } from "../r2";
import { aiModels, generateAi } from "../ai-server";
import {
  generationRequestId,
  GenerationCancelled,
  GenerationStopFailed,
} from "./generation-control";
import { activeGuardrailPolicy, assertAiEnabled } from "./guardrail-policy";
import { createGuardrailSession } from "./guardrails";
import { createTokenTracker } from "./token-usage";
import {
  deliverableKinds,
  validateDeliverablePlan,
  resolveDeliverableEvidence,
  commitDeliverables,
  type PlannedItem,
} from "./deliverable-batch-commit";
import {
  deliverableInstructions,
  deliverableResponseFormat,
} from "./deliverable-generation-prompt";
import { readRfp, mutateRfp, validateRfp } from "../rfp-server";
import type { RfpDraft } from "../rfp-types";
import {
  allowedLinks,
  type SourceReference,
  type Artifact,
} from "../artifact-types";
type Input = {
  createRfp?: boolean;
  sources: { type: string; id?: string }[];
  targets: string[];
  model: string;
  prompt: string;
};
type Payload = {
  sources: CapturedSource[];
  versions: [string, number][];
  maxChanges: number;
  aiResponseId?: string;
  aiAttempted?: boolean;
  rfpDraft?: RfpDraft;
  rfpResult?: {
    id: string;
    version: number;
    snapshotId: string;
    title: string;
  };
  evidenceWarnings?: { clientRef: string; message: string }[];
  items?: PlannedItem[];
  coverage?: { kind: string; reason: string }[];
  duplicates?: {
    clientRef: string;
    title: string;
    candidates: { id: string; code: string; title: string }[];
  }[];
};
const versions = (artifacts: Artifact[]) =>
  artifacts
    .map((a) => [a.id, a.version] as [string, number])
    .sort((a, b) => a[0].localeCompare(b[0]));
async function owned(
  executor: Pick<Client, "execute">,
  user: User,
  projectId: string,
  id: string,
) {
  generationRequestId(id);
  await requireProjectPermission(executor, user, projectId, "overview", "READ");
  const row = (
    await executor.execute({
      sql: "SELECT * FROM project_deliverable_generation_requests WHERE request_id=? AND workspace_id=? AND project_id=? AND user_id=?",
      args: [id, user.workspaceId, projectId, user.id],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "생성 요청을 찾을 수 없습니다.");
  return row;
}
function dto(row: Row) {
  const payload = JSON.parse(String(row.payload_json)) as Payload;
  return {
    requestId: String(row.request_id),
    status: String(row.status),
    stage: Number(row.stage),
    error: row.error === null ? null : String(row.error),
    result: row.result_json ? JSON.parse(String(row.result_json)) : null,
    coverage: payload.coverage ?? [],
    duplicates: payload.duplicates ?? [],
    evidenceWarnings: payload.evidenceWarnings ?? [],
    rfpResult: payload.rfpResult ?? null,
    busy:
      !!row.lease_token && String(row.lease_until) > new Date().toISOString(),
  };
}
async function rights(
  executor: Pick<Client, "execute">,
  user: User,
  projectId: string,
  input: Input,
) {
  if (input.createRfp)
    await requireProjectPermission(executor, user, projectId, "rfp", "CREATE");
  for (const kind of input.targets)
    await requireProjectPermission(
      executor,
      user,
      projectId,
      kind as (typeof deliverableKinds)[number],
      "CREATE",
    );
}
// Reconcile usage even when cancellation happens after a worker restart.
export async function recordDeliverableResponse(
  scope: {
    workspaceId: string;
    userId: string;
    projectId: string;
    requestId: string;
  },
  input: { model: string; prompt: string },
  response: Record<string, unknown>,
) {
  const project = (
    await db().execute({
      sql: "SELECT name FROM projects WHERE id=? AND workspace_id=?",
      args: [scope.projectId, scope.workspaceId],
    })
  ).rows[0];
  const track = createTokenTracker({
    ...scope,
    projectName: String(project?.name ?? ""),
    convId: "deliverables:" + scope.projectId,
    conversationTitle: "연계 문서 일괄 생성",
    chatId: scope.requestId,
    requestId: scope.requestId + ":background",
    model: input.model,
    prompt: input.prompt,
  });
  await track({
    turn: 0,
    status: String(response.status ?? "unknown"),
    responseId: String(response.id ?? ""),
    model: input.model,
    usage: response.usage,
    httpStatus: 200,
  });
}
export async function latestDeliverable(user: User, projectId: string) {
  await requireProjectPermission(db(), user, projectId, "overview", "READ");
  const row = (
    await db().execute({
      sql: "SELECT * FROM project_deliverable_generation_requests WHERE workspace_id=? AND project_id=? AND user_id=? ORDER BY created_at DESC LIMIT 1",
      args: [user.workspaceId, projectId, user.id],
    })
  ).rows[0];
  return row ? dto(row) : null;
}
export async function deliverableStatus(
  user: User,
  projectId: string,
  id: string,
) {
  return dto(await owned(db(), user, projectId, id));
}
export async function startDeliverables(
  request: Request,
  user: User,
  projectId: string,
  value: Record<string, unknown>,
) {
  const id = generationRequestId(value.requestId);
  if (
    (value.createRfp !== undefined && typeof value.createRfp !== "boolean") ||
    !Array.isArray(value.sources) ||
    !value.sources.length ||
    value.sources.length > 4 ||
    value.sources.some(
      (s) => !s || typeof s !== "object" || !["rfp", "file"].includes(s.type),
    ) ||
    !Array.isArray(value.targets) ||
    !value.targets.length ||
    value.targets.some(
      (k) => !deliverableKinds.includes(k as (typeof deliverableKinds)[number]),
    ) ||
    typeof value.model !== "string" ||
    value.model.length > 200 ||
    typeof value.prompt !== "string" ||
    value.prompt.length > 2000
  )
    throw new HttpError(400, "생성 원본·대상·모델·요청 범위를 확인해 주세요.");
  const input: Input = {
    ...(value.createRfp === true ? { createRfp: true } : {}),
    sources: value.sources.map((s) => ({
      type: String(s.type),
      ...(typeof s.id === "string" ? { id: s.id } : {}),
    })),
    targets: [...new Set(value.targets as string[])].sort(),
    model: value.model,
    prompt: value.prompt.trim(),
  };
  if (
    input.sources.filter((s) => s.type === "file").length > 3 ||
    input.sources.filter((s) => s.type === "rfp").length > 1 ||
    new Set(input.sources.map((s) => s.type + ":" + s.id)).size !==
      input.sources.length
  )
    throw new HttpError(400, "RFP 1개와 보조 파일 최대 3개를 선택해 주세요.");
  if (input.createRfp && !input.sources.some((s) => s.type === "file"))
    throw new HttpError(
      400,
      "제안요청서 초안을 생성할 첨부 문서를 선택해 주세요.",
    );
  const canonical = JSON.stringify(input);
  const prior = (
    await db().execute({
      sql: "SELECT * FROM project_deliverable_generation_requests WHERE request_id=?",
      args: [id],
    })
  ).rows[0];
  if (prior) {
    await owned(db(), user, projectId, id);
    if (prior.input_json !== canonical)
      throw new HttpError(
        409,
        "동일 요청 ID에 다른 입력을 사용할 수 없습니다.",
      );
    return dto(prior);
  }
  await rights(db(), user, projectId, input);
  if (input.createRfp && (await readRfp(db(), user, projectId)).document)
    throw new HttpError(
      409,
      "이미 제안요청서가 있습니다. 기존 제안요청서 사용으로 새 요청을 시작해 주세요.",
    );
  const policy = await activeGuardrailPolicy(user.workspaceId);
  if (input.createRfp && policy.policy.maxChanges < 2)
    throw new HttpError(
      403,
      "제안요청서와 연계 문서를 생성하려면 관리자 변경 한도가 최소 2건이어야 합니다.",
    );
  if (
    !policy.policy.aiEnabled ||
    !policy.policy.allowedActions.includes("CREATE") ||
    policy.policy.maxChanges < 1
  )
    throw new HttpError(403, "관리자 정책에서 생성을 허용하지 않습니다.");
  if (!(await aiModels()).includes(input.model))
    throw new HttpError(400, "사용 가능한 모델을 선택해 주세요.");
  await rateLimit("deliverables:" + user.workspaceId + ":" + user.id, 20);
  const sources: CapturedSource[] = [];
  for (const source of input.sources)
    sources.push(await captureSource(user, projectId, source, request.signal));
  if (sources.reduce((n, s) => n + s.content.length, 0) > 100000)
    throw new HttpError(
      413,
      "원본 합산 추출 본문은 100,000자 이하로 선택해 주세요.",
    );
  const data = await projectData(db(), user, projectId);
  const payload: Payload = {
    sources,
    versions: versions(data.artifacts),
    maxChanges: policy.policy.maxChanges,
  };
  const now = new Date().toISOString();
  const tx = await db().transaction("write");
  try {
    await rights(tx, user, projectId, input);
    const replay = (
      await tx.execute({
        sql: "SELECT * FROM project_deliverable_generation_requests WHERE request_id=?",
        args: [id],
      })
    ).rows[0];
    if (replay) {
      await owned(tx, user, projectId, id);
      if (replay.input_json !== canonical)
        throw new HttpError(
          409,
          "동일 요청 ID에 다른 입력을 사용할 수 없습니다.",
        );
      await tx.commit();
      return dto(replay);
    }
    const active = (
      await tx.execute({
        sql: "SELECT request_id FROM project_deliverable_generation_requests WHERE project_id=? AND workspace_id=? AND status IN ('running','validating','finalizing','stop_requested') LIMIT 1",
        args: [projectId, user.workspaceId],
      })
    ).rows[0];
    if (active)
      throw new HttpError(
        409,
        "진행 중인 일괄 생성 요청이 있습니다. 이전 요청 조회/이어가기를 사용해 주세요.",
      );
    if (input.createRfp && (await readRfp(tx, user, projectId)).document)
      throw new HttpError(409, "생성 등록 중 제안요청서가 추가되었습니다.");
    await verifyCapturedSources(tx, user, projectId, sources);
    for (const s of sources)
      await persistCapturedSource(tx, user, projectId, s);
    await tx.execute({
      sql: "INSERT INTO project_deliverable_generation_requests(request_id,workspace_id,project_id,user_id,input_json,status,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,'running',?,?,?)",
      args: [
        id,
        user.workspaceId,
        projectId,
        user.id,
        canonical,
        JSON.stringify(payload),
        now,
        now,
      ],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
  return deliverableStatus(user, projectId, id);
}
export async function stopDeliverables(
  user: User,
  projectId: string,
  id: string,
) {
  const row = await owned(db(), user, projectId, id);
  if (
    ["running", "validating", "review_required", "stop_requested"].includes(
      String(row.status),
    )
  )
    await db().execute({
      sql: "UPDATE project_deliverable_generation_requests SET status=?,updated_at=? WHERE request_id=? AND status IN ('running','validating','review_required','stop_requested')",
      args: [
        (row.lease_token &&
          String(row.lease_until) > new Date().toISOString()) ||
        (JSON.parse(String(row.payload_json)) as Payload).aiResponseId
          ? "stop_requested"
          : "cancelled",
        new Date().toISOString(),
        id,
      ],
    });
  return deliverableStatus(user, projectId, id);
}
export async function queueDeliverables(
  user: User,
  projectId: string,
  id: string,
  resolutions: unknown,
) {
  const row = await owned(db(), user, projectId, id);
  if (row.status !== "review_required") return dto(row);
  const input = JSON.parse(String(row.input_json)) as Input;
  await rights(db(), user, projectId, input);
  const payload = JSON.parse(String(row.payload_json)) as Payload;
  applyResolutions(payload, resolutions);
  if (input.createRfp && payload.items?.some((p) => p.reuseId)) {
    const policy = await activeGuardrailPolicy(user.workspaceId);
    if (!policy.policy.allowedActions.includes("UPDATE"))
      throw new HttpError(
        403,
        "현재 정책에서는 기존 문서에 제안요청서 출처를 추가할 수 없습니다. 신규 생성을 선택해 주세요.",
      );
    for (const item of payload.items.filter((p) => p.reuseId))
      await requireProjectPermission(
        db(),
        user,
        projectId,
        item.kind,
        "UPDATE",
      );
  }
  await db().execute({
    sql: "UPDATE project_deliverable_generation_requests SET status='validating',payload_json=?,updated_at=? WHERE request_id=? AND status='review_required' AND lease_token IS NULL",
    args: [JSON.stringify(payload), new Date().toISOString(), id],
  });
  return deliverableStatus(user, projectId, id);
}
function applyResolutions(payload: Payload, resolutions: unknown) {
  if (
    !resolutions ||
    typeof resolutions !== "object" ||
    Array.isArray(resolutions)
  )
    throw new HttpError(400, "중복 후보를 검토해 주세요.");
  const choices = resolutions as Record<string, string>;
  for (const d of payload.duplicates ?? []) {
    const choice = choices[d.clientRef];
    if (choice !== "new" && !d.candidates.some((a) => a.id === choice))
      throw new HttpError(400, "재사용 또는 신규 생성을 선택해 주세요.");
    const item = payload.items!.find((p) => p.clientRef === d.clientRef)!;
    if (choice === "new") delete item.reuseId;
    else item.reuseId = choice;
  }
}
export async function continueDeliverables(
  request: Request,
  user: User,
  projectId: string,
  id: string,
  resolutions: unknown,
  background = false,
) {
  let row = await owned(db(), user, projectId, id);
  if (["completed", "failed", "cancelled"].includes(String(row.status)))
    return dto(row);
  if (row.status === "stop_requested" && !background)
    return stopDeliverables(user, projectId, id);
  const input = JSON.parse(String(row.input_json)) as Input,
    payload = JSON.parse(String(row.payload_json)) as Payload;
  await rights(db(), user, projectId, input);
  if (row.status === "review_required") applyResolutions(payload, resolutions);
  const lease = randomUUID(),
    now = new Date().toISOString();
  const acquired = await db().execute({
    sql: "UPDATE project_deliverable_generation_requests SET lease_token=?,lease_until=?,status=CASE WHEN status='stop_requested' THEN status ELSE 'running' END,payload_json=?,updated_at=? WHERE request_id=? AND status IN ('running','validating','review_required','stop_requested') AND (lease_token IS NULL OR lease_until<?) RETURNING request_id",
    args: [
      lease,
      new Date(Date.now() + 180000).toISOString(),
      JSON.stringify(payload),
      now,
      id,
      now,
    ],
  });
  if (!acquired.rows.length) return deliverableStatus(user, projectId, id);
  let renewedAt = Date.now();
  const checkpoint = async (executor: Pick<Client, "execute"> = db()) => {
    request.signal.throwIfAborted();
    const current = await owned(executor, user, projectId, id);
    if (current.status === "stop_requested" || current.status === "cancelled")
      throw new GenerationCancelled();
    if (
      current.lease_token !== lease ||
      String(current.lease_until) <= new Date().toISOString()
    )
      throw new HttpError(409, "생성 단계의 유효 시간이 만료되었습니다.");
    if (background && Date.now() - renewedAt >= 20000) {
      const renewed = await executor.execute({
        sql: "UPDATE project_deliverable_generation_requests SET lease_until=?,updated_at=? WHERE request_id=? AND lease_token=? AND lease_until>?",
        args: [
          new Date(Date.now() + 180000).toISOString(),
          new Date().toISOString(),
          id,
          lease,
          new Date().toISOString(),
        ],
      });
      if (!renewed.rowsAffected)
        throw new HttpError(409, "작업 잠금을 갱신할 수 없습니다.");
      renewedAt = Date.now();
    }
    await assertAiEnabled(user.workspaceId, executor);
  };
  try {
    if (background && row.status === "stop_requested") {
      if (payload.aiResponseId) {
        const { retrieveResponse, activeResponse } = await import(
          "./background-response"
        );
        let response = await retrieveResponse(payload.aiResponseId);
        if (activeResponse(response.status))
          response = await retrieveResponse(payload.aiResponseId, true);
        if (activeResponse(response.status)) throw new GenerationStopFailed();
        await recordDeliverableResponse(
          {
            workspaceId: user.workspaceId,
            userId: user.id,
            projectId,
            requestId: id,
          },
          input,
          response,
        );
      }
      throw new GenerationCancelled();
    }
    await checkpoint();
    const policy = await activeGuardrailPolicy(user.workspaceId);
    if (!policy.policy.allowedActions.includes("CREATE"))
      throw new HttpError(403, "생성 권한이 변경되었습니다.");
    const limit =
      Math.min(payload.maxChanges, policy.policy.maxChanges) -
      (input.createRfp ? 1 : 0);
    if (limit < 1)
      throw new HttpError(
        403,
        "관리자 변경 한도가 제안요청서와 연계 문서를 함께 생성하기에 부족합니다.",
      );
    if (Number(row.stage) === 0) {
      if (input.createRfp && (await readRfp(db(), user, projectId)).document)
        throw new HttpError(
          409,
          "생성 중 제안요청서가 추가되었습니다. 기존 문서는 유지됩니다.",
        );
      const data = await projectData(db(), user, projectId);
      if (
        JSON.stringify(versions(data.artifacts)) !==
        JSON.stringify(payload.versions)
      )
        throw new HttpError(
          409,
          "프로젝트 자료가 변경되었습니다. 새 생성 요청을 시작해 주세요.",
        );
      const track = createTokenTracker({
        workspaceId: user.workspaceId,
        userId: user.id,
        projectId,
        projectName: data.project.name,
        convId: "deliverables:" + projectId,
        conversationTitle: "연계 문서 일괄 생성",
        chatId: id,
        requestId: background ? id + ":background" : id + ":" + lease,
        model: input.model,
        prompt: input.prompt,
      });
      // const guard = createGuardrailSession({
      //   workspaceId: user.workspaceId,
      //   userId: user.id,
      //   requestId: id,
      //   version: policy.version,
      //   policy: policy.policy,
      //   checkpoint,
      //   track,
      //   deadline: Date.now() + 140000,
      // });
      // await guard.inspect("input", input.prompt);
      const context = {
        sources: payload.sources.map((s) => ({
          type: s.type,
          name: s.name,
          content: s.content,
        })),
        createRfp: !!input.createRfp,
        targets: input.targets,
        maxChanges: limit,
        prompt: input.prompt,
        allowedLinks,
        existing: data.artifacts.map((a) => ({
          id: a.id,
          kind: a.kind,
          code: a.code,
          title: a.title,
          links: a.links,
        })),
      };
      // await guard.inspect("context", context);
      if (background && payload.aiAttempted && !payload.aiResponseId) {
        const tracked = (
          await db().execute({
            sql: "SELECT response_id FROM ai_token_usage WHERE request_id=? AND call_index=0 AND response_id IS NOT NULL LIMIT 1",
            args: [id + ":background"],
          })
        ).rows[0];
        if (tracked) payload.aiResponseId = String(tracked.response_id);
      }
      if (background && payload.aiAttempted && !payload.aiResponseId)
        throw new HttpError(
          409,
          "이전 AI 요청의 접수 여부를 확인할 수 없습니다. 중복 과금을 피하기 위해 자동 재생성하지 않았습니다.",
        );
      if (background && !payload.aiResponseId) {
        payload.aiAttempted = true;
        await db().execute({
          sql: "UPDATE project_deliverable_generation_requests SET payload_json=? WHERE request_id=? AND lease_token=?",
          args: [JSON.stringify(payload), id, lease],
        });
      }
      const text = await generateAi(
        input.model,
        deliverableInstructions,
        JSON.stringify(context),
        undefined,
        [],
        [],
        track,
        checkpoint,
        {
          responseFormat: deliverableResponseFormat(!!input.createRfp),
          maxOutputTokens: 16000,
          deadline: background ? null : Date.now() + 140000,
          resumeResponseId: background ? payload.aiResponseId : undefined,
          onResponse: background
            ? async (responseId: string) => {
                payload.aiResponseId = responseId;
                const saved = await db().execute({
                  sql: "UPDATE project_deliverable_generation_requests SET payload_json=?,updated_at=? WHERE request_id=? AND lease_token=?",
                  args: [
                    JSON.stringify(payload),
                    new Date().toISOString(),
                    id,
                    lease,
                  ],
                });
                if (!saved.rowsAffected)
                  throw new HttpError(
                    409,
                    "AI 응답의 작업 소유권이 변경되었습니다.",
                  );
              }
            : undefined,
        },
      );
      // await guard.inspect("output", text);
      let envelope;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw new HttpError(502, "완전한 생성 결과를 받지 못했습니다.");
      }
      if (
        envelope.complete !== true ||
        !Array.isArray(envelope.coverage) ||
        envelope.coverage.length !== input.targets.length ||
        input.targets.some(
          (k) =>
            envelope.coverage.filter(
              (c: { kind: string; reason: string }) =>
                c.kind === k && typeof c.reason === "string",
            ).length !== 1,
        )
      )
        throw new HttpError(
          502,
          "대상 문서 전체의 생성이 완료되지 않았습니다.",
        );
      if (input.createRfp) {
        const draft = envelope.rfpDocument;
        if (!draft || typeof draft !== "object" || Array.isArray(draft))
          throw new HttpError(502, "제안요청서 초안이 생성되지 않았습니다.");
        const normalized = { ...draft, projectId, schemaVersion: 1 };
        for (const key of ["requirements", "evaluation"])
          if (Array.isArray(normalized[key]))
            normalized[key] = normalized[key].map(
              (r: Record<string, unknown>) => ({ ...r, id: randomUUID() }),
            );
        if (normalized.delivery && Array.isArray(normalized.delivery.schedule))
          normalized.delivery = {
            ...normalized.delivery,
            schedule: normalized.delivery.schedule.map(
              (r: Record<string, unknown>) => ({ ...r, id: randomUUID() }),
            ),
          };
        const validated = validateRfp(normalized, projectId);
        if (!validated.title.trim())
          throw new HttpError(502, "제안요청서 초안의 제목이 없습니다.");
        validated.appendix.references = [
          validated.appendix.references,
          "일괄 생성 원본: " + payload.sources.map((s) => s.name).join(", "),
        ]
          .filter(Boolean)
          .join("\n");
        payload.rfpDraft = validateRfp(validated, projectId);
      }
      payload.items = validateDeliverablePlan(
        envelope.items,
        input.targets,
        limit,
      );
      payload.coverage = envelope.coverage;
      if (
        payload.coverage!.some(
          (c) =>
            !payload.items!.some((p) => p.kind === c.kind) && !c.reason.trim(),
        )
      )
        throw new HttpError(502, "생성하지 않은 문서 종류의 근거가 없습니다.");
      const resolvedEvidence = resolveDeliverableEvidence(
        payload.items,
        payload.sources,
      );
      payload.items = resolvedEvidence.items;
      payload.evidenceWarnings = resolvedEvidence.warnings;
      const evidence = (
        await db().execute({
          sql: "SELECT r.artifact_id,r.excerpt,s.source_type,s.source_id,s.content_hash FROM artifact_source_references r JOIN project_source_snapshots s ON s.id=r.snapshot_id AND s.project_id=r.project_id AND s.workspace_id=r.workspace_id WHERE r.project_id=? AND r.workspace_id=?",
          args: [projectId, user.workspaceId],
        })
      ).rows;
      const sameEvidence = (artifactId: string, p: PlannedItem) => {
        const source = payload.sources[p.sourceIndex];
        return evidence.some(
          (r) =>
            r.artifact_id === artifactId &&
            r.source_type === source.type &&
            r.source_id === source.sourceId &&
            (p.excerpt
              ? r.excerpt === p.excerpt
              : r.excerpt === "" && r.content_hash === source.hash),
        );
      };
      payload.duplicates = payload.items
        .map((p) => ({
          clientRef: p.clientRef,
          title: p.title,
          candidates: data.artifacts
            .filter(
              (a) =>
                a.kind === p.kind &&
                (a.title.trim().toLowerCase() ===
                  p.title.trim().toLowerCase() ||
                  sameEvidence(a.id, p)),
            )
            .map((a) => ({ id: a.id, code: a.code, title: a.title })),
        }))
        .filter((p) => p.candidates.length);
      await checkpoint();
      await db().execute({
        sql: "UPDATE project_deliverable_generation_requests SET stage=1,status=?,payload_json=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE request_id=? AND lease_token=? AND status='running'",
        args: [
          payload.duplicates.length ? "review_required" : "validating",
          JSON.stringify(payload),
          new Date().toISOString(),
          id,
          lease,
        ],
      });
    } else {
      if (!payload.items) throw new HttpError(409, "저장할 생성안이 없습니다.");
      validateDeliverablePlan(payload.items, input.targets, limit);
      for (const s of payload.sources.filter((s) => s.type === "file")) {
        const hash = createHash("sha256")
          .update(Buffer.from(await getDocument(s.objectKey!)))
          .digest("hex");
        if (hash !== s.hash)
          throw new HttpError(409, "원본 파일 본문이 변경되었습니다.");
      }
      const tx = await db().transaction("write");
      try {
        await checkpoint(tx);
        await rights(tx, user, projectId, input);
        await verifyCapturedSources(tx, user, projectId, payload.sources);
        const current = await projectData(tx, user, projectId);
        if (
          JSON.stringify(versions(current.artifacts)) !==
          JSON.stringify(payload.versions)
        )
          throw new HttpError(409, "생성 중 기존 문서가 변경되었습니다.");
        const fresh = await activeGuardrailPolicy(user.workspaceId, tx);
        if (
          !fresh.policy.aiEnabled ||
          !fresh.policy.allowedActions.includes("CREATE") ||
          (input.createRfp &&
            payload.items.some((p) => p.reuseId) &&
            !fresh.policy.allowedActions.includes("UPDATE")) ||
          payload.items.filter((p) => !p.reuseId).length +
            (input.createRfp ? 1 : 0) >
            fresh.policy.maxChanges
        )
          throw new HttpError(403, "생성 정책이 변경되었습니다.");
        await tx.execute({
          sql: "UPDATE project_deliverable_generation_requests SET status='finalizing' WHERE request_id=? AND lease_token=?",
          args: [id, lease],
        });
        const additionalSources: SourceReference[] = [];
        if (input.createRfp) {
          if (!payload.rfpDraft)
            throw new HttpError(409, "저장할 제안요청서 초안이 없습니다.");
          // CREATE rejects any concurrent document. All RFP and artifact writes share this transaction.
          const rfp = await mutateRfp(
            request,
            user,
            projectId,
            { draft: payload.rfpDraft },
            "CREATE",
            tx,
          );
          const content = JSON.stringify(rfp.draft);
          const snapshot: CapturedSource = {
            id: randomUUID(),
            type: "rfp",
            sourceId: rfp.id,
            version: rfp.version,
            name: rfp.draft.title,
            content,
            hash: createHash("sha256").update(content).digest("hex"),
          };
          await persistCapturedSource(tx, user, projectId, snapshot);
          payload.rfpResult = {
            id: rfp.id,
            version: rfp.version,
            snapshotId: snapshot.id,
            title: rfp.draft.title,
          };
          additionalSources.push({
            snapshotId: snapshot.id,
            locator: "제안요청서 · " + rfp.draft.title,
            excerpt: "",
            rationale:
              "첨부 문서에서 함께 생성한 제안요청서 초안을 기준으로 연결한 산출물입니다.",
            origin: "설계 도출",
          });
        }
        const result = await commitDeliverables(
          tx,
          request,
          user,
          projectId,
          payload.items,
          current.artifacts,
          payload.sources.map((s) => s.id),
          additionalSources,
        );
        await tx.execute({
          sql: "UPDATE project_deliverable_generation_requests SET status='completed',result_json=?,payload_json=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE request_id=? AND lease_token=?",
          args: [
            JSON.stringify(result),
            JSON.stringify(payload),
            new Date().toISOString(),
            id,
            lease,
          ],
        });
        await tx.commit();
      } catch (e) {
        await tx.rollback();
        throw e;
      } finally {
        tx.close();
      }
    }
  } catch (e) {
    const cancelled =
      e instanceof GenerationCancelled || request.signal.aborted;
    let stopUnconfirmed = e instanceof GenerationStopFailed;
    if (background && payload.aiResponseId && !stopUnconfirmed) {
      try {
        const { retrieveResponse, activeResponse } = await import(
          "./background-response"
        );
        let response = await retrieveResponse(payload.aiResponseId);
        if (activeResponse(response.status))
          response = await retrieveResponse(payload.aiResponseId, true);
        stopUnconfirmed = activeResponse(response.status);
        await recordDeliverableResponse(
          {
            workspaceId: user.workspaceId,
            userId: user.id,
            projectId,
            requestId: id,
          },
          input,
          response,
        );
      } catch (error) {
        stopUnconfirmed = !(
          error instanceof HttpError && error.details?.providerStatus === 404
        );
      }
    }
    await db().execute({
      sql: "UPDATE project_deliverable_generation_requests SET status=?,error=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE request_id=? AND lease_token=?",
      args: [
        stopUnconfirmed ? "stop_requested" : cancelled ? "cancelled" : "failed",
        cancelled
          ? null
          : e instanceof HttpError
            ? e.message
            : "일괄 생성 중 오류가 발생했습니다.",
        new Date().toISOString(),
        id,
        lease,
      ],
    });
    if (!cancelled && !stopUnconfirmed) throw e;
  }
  row = await owned(db(), user, projectId, id);
  return dto(row);
}
