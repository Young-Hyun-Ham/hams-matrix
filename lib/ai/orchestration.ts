import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "../db";
import type { User } from "../types";
import { HttpError } from "../auth";
import { classifyIntent } from "./intent-classifier";
import { retrieveRag, type RagResult } from "./rag-retrieval";
import type { AiCallEvent } from "./token-types";
export async function orchestrateChat(options: {
  user: User;
  projectId: string;
  prompt: string;
  model: string;
  history: Record<string, unknown>[];
  checkpoint: () => Promise<void>;
  track: (event: AiCallEvent) => Promise<void>;
  deadline: number;
  requestId: string;
  signal?: AbortSignal;
  targetPage?: string;
}) {
  const started = Date.now(),
    plan = await classifyIntent(options);
  let rag: RagResult = {
    generationId: null,
    references: [],
    context: null,
    fallbackCode: null,
    manifest: null,
  };
  if (options.projectId && plan.needsRag && !plan.needsClarification) {
    try {
      rag = await retrieveRag(options);
    } catch (error) {
      await options.checkpoint();
      if (error instanceof HttpError && [401, 403, 404].includes(error.status))
        throw error;
      rag = { ...rag, fallbackCode: "RAG_UNAVAILABLE" };
    }
  }
  if (options.projectId)
    await db().execute({
      sql: "INSERT INTO ai_orchestration_events(id,workspace_id,project_id,user_id,request_id,classifier_version,primary_intent,route_flags_json,reason_code,generation_id,source_refs_json,fallback_code,duration_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        randomUUID(),
        options.user.workspaceId,
        options.projectId,
        options.user.id,
        options.requestId,
        plan.classifierVersion,
        plan.primaryIntent,
        JSON.stringify({
          needsRag: plan.needsRag,
          needsRealtime: plan.needsRealtime,
          needsExecution: plan.needsExecution,
          needsClarification: plan.needsClarification,
        }),
        plan.reasonCode,
        rag.generationId,
        JSON.stringify(
          rag.references.map((r) => ({
            sourceType: r.sourceType,
            sourceId: r.sourceId,
            version: r.version,
            chunkId: r.chunkId,
          })),
        ),
        rag.fallbackCode,
        Date.now() - started,
        new Date().toISOString(),
      ],
    });
  return {
    plan,
    rag,
    instructions: `\n[1-layer 처리 계획] ${JSON.stringify(plan)}\n프로젝트의 사실은 제공한 검색 근거와 최신 조회 결과로만 답한다. 원문에 없는 사실은 만들지 말고 설계 의견과 구분한다. ${plan.needsClarification ? "대상과 작업이 모호하므로 확인 질문을 하고 실행하지 않는다." : ""} ${plan.needsRealtime ? "현재 수치·상태는 read_page 등 최신 조회로 확인하고 조회 시각을 설명한다." : ""} ${rag.fallbackCode ? `검색 상태: ${rag.fallbackCode}. 직접 조회한 범위만 답하고 필요하면 재벡터화를 안내한다.` : "근거의 제목과 버전을 명시한다."}`,
  };
}
export function restrictAgent<
  T extends {
    tools: Record<string, unknown>[];
    execute: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  },
>(agent: T, writeAllowed: boolean) {
  const allowed = new Set(
    agent.tools
      .filter((t) => writeAllowed || String(t.name).startsWith("read_"))
      .map((t) => String(t.name)),
  );
  return {
    ...agent,
    tools: agent.tools.filter((t) => allowed.has(String(t.name))),
    execute: async (name: string, input: Record<string, unknown>) => {
      if (!allowed.has(name))
        throw new HttpError(
          403,
          "현재 의도분류 경로에서 허용되지 않은 작업입니다.",
        );
      return agent.execute(name, input);
    },
  };
}
