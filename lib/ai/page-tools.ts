import "server-only";
import { HttpError } from "../auth";
import { mutateArtifact, projectAccess, toArtifact } from "../artifacts";
import { db } from "../db";
import type { User } from "../types";
import type { AiContext } from "../ai-context";
import type { AiPage } from "./page-prompts";
import { readAiPage } from "./page-data";
import { definitions } from "../artifact-types";
import type { Client, Transaction } from "@libsql/client";
import { GenerationCancelled } from "./generation-control";
import { GuardrailBlocked } from "./guardrails";
import type { GuardrailPolicy, GuardrailStage } from "./guardrail-types";
export type AiAction = {
  action: string;
  id: string;
  code: string;
  title: string;
  version: number;
};
const intents = {
  CREATE:
    /(?:등록|저장|추가)(?:해|하)|(?:등록|저장|추가)\s*[.!?]?$|\bcreate\b|\bsave\b/i,
  UPDATE: /(?:수정|변경)(?:해|하)|(?:수정|변경)\s*[.!?]?$|\bupdate\b|\bedit\b/i,
  DELETE:
    /(?:삭제|제거)(?:해|하)|(?:삭제|제거)\s*[.!?]?$|\bdelete\b|\bremove\b/i,
};
export function createPageAgent(
  request: Request,
  user: User,
  context: AiContext,
  page: AiPage,
  canWrite: boolean,
  prompt: string,
  checkpoint?: (executor?: Pick<Client, "execute">) => Promise<void>,
  guard?: { policy: GuardrailPolicy; inspect: (stage: GuardrailStage, value: unknown) => Promise<unknown> },
) {
  const actions: AiAction[] = [],
    seen = new Set<string>();
  const pending: { input: Record<string, unknown>; action: "CREATE" | "UPDATE" | "DELETE"; id?: string }[] = [];
  const tools: Record<string, unknown>[] = [
    {
      type: "function",
      name: "read_page",
      description: "현재 페이지의 최신 DB 자료와 ID/version/연결을 조회합니다.",
      strict: false,
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  ];
  if (page.kind && canWrite)
    tools.push({
      type: "function",
      name: "save_artifact",
      description:
        "명시적으로 요청한 현재 탭의 산출물만 등록/수정/삭제합니다. 수정·삭제는 조회한 실제 id와 version이 필수입니다. 삭제 대상은 사용자 입력에 명시돼야 합니다.",
      strict: false,
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["CREATE", "UPDATE", "DELETE"] },
          id: { type: "string" },
          version: { type: "integer" },
          title: { type: "string" },
          status: { type: "string" },
          fields: {
            type: "object",
            description: "현재 kind의 필드 키, 값은 문자열. 수정할 항목만 전달",
          },
          links: { type: "array", items: { type: "string" } },
          structure: {
            type: "object",
            description:
              "WBS parentId/dependencies, DB columns, 프로그램 tableOperations, 아키텍처 topology {nodes,edges}. 기존 값은 생략 시 보존",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    });
  async function execute(name: string, input: Record<string, unknown>) {
    try {
      await checkpoint?.();
      await guard?.inspect("tool", { name, input });
      if (name === "read_page") {
        if (Object.keys(input).length) throw new HttpError(400, "조회 도구에는 인자를 지정할 수 없습니다.");
        const data = await readAiPage(user, context, page);
        await guard?.inspect("tool-result", data);
        return { success: true, data, pendingChanges: pending.map(change => ({ action: change.action, title: change.input.title, state: "pending_validation" })) };
      }
      if (name !== "save_artifact" || !page.kind || !canWrite)
        throw new HttpError(
          403,
          "현재 화면 또는 권한에서는 이 도구를 사용할 수 없습니다.",
        );
      await projectAccess(db(), user, context.projectId, true);
      const action = input.action;
      if (action !== "CREATE" && action !== "UPDATE" && action !== "DELETE")
        throw new HttpError(400, "작업 유형을 확인해 주세요.");
      if (guard && !guard.policy.allowedActions.includes(action)) throw new HttpError(403, "관리자 정책에서 허용하지 않은 변경 작업입니다.");
      if (
        /(?:등록|저장|추가|수정|변경|삭제|제거).{0,6}(?:하지\s*마|하지\s*말|금지|하지\s*않)/.test(
          prompt,
        )
      )
        throw new HttpError(
          403,
          "변경 금지 요청이 포함되어 있습니다. 조회만 수행합니다.",
        );
      if (!intents[action].test(prompt))
        throw new HttpError(
          403,
          "사용자가 해당 등록·수정·삭제 작업을 명시적으로 요청하지 않았습니다.",
        );
      if (pending.length >= (guard?.policy.maxChanges ?? 3))
        throw new HttpError(
          400,
          "한 요청에서는 최대 3건까지 변경할 수 있습니다.",
        );
      const signature = JSON.stringify(input);
      if (seen.has(signature))
        throw new HttpError(
          409,
          "동일한 작업은 이미 처리했습니다. 최신 내용을 조회해 주세요.",
        );
      const invalid = Object.keys(input).filter(
        (key) =>
          ![
            "action",
            "id",
            "version",
            "title",
            "status",
            "fields",
            "links",
            "structure",
          ].includes(key),
      );
      if (invalid.length || JSON.stringify(input).length > 100000)
        throw new HttpError(400, "허용되지 않은 입력입니다.");
      await projectAccess(db(), user, context.projectId, true);
      let before;
      if (action !== "CREATE") {
        if (typeof input.id !== "string" || !Number.isInteger(input.version))
          throw new HttpError(
            400,
            "수정/삭제 대상의 ID와 최신 버전이 필요합니다.",
          );
        const row = await db().execute({
          sql: "SELECT * FROM project_artifacts WHERE id=? AND project_id=? AND workspace_id=? AND kind=? AND deleted_at IS NULL",
          args: [input.id, context.projectId, user.workspaceId, page.kind],
        });
        if (!row.rows[0])
          throw new HttpError(404, "현재 탭에서 대상을 찾을 수 없습니다.");
        const links = await db().execute({
          sql: "SELECT target_id FROM artifact_links WHERE source_id=? AND project_id=? AND workspace_id=? AND relation='reference'",
          args: [input.id, context.projectId, user.workspaceId],
        });
        before = toArtifact(
          row.rows[0],
          links.rows.map((edge) => String(edge.target_id)),
        );
        if (
          ![before.id, before.code, before.title].some((value) =>
            prompt.includes(value),
          )
        )
          throw new HttpError(
            400,
            "수정/삭제할 관리번호 또는 정확한 명칭을 입력해 주세요.",
          );
      } else if (input.id !== undefined || input.version !== undefined)
        throw new HttpError(400, "신규 항목의 ID/버전은 서버가 발급합니다.");
      if (
        input.fields !== undefined &&
        (!input.fields ||
          typeof input.fields !== "object" ||
          Array.isArray(input.fields))
      )
        throw new HttpError(400, "fields는 객체여야 합니다.");
      const fields = input.fields as Record<string, unknown> | undefined;
      if (
        fields &&
        Object.keys(fields).some(
          (key) =>
            !definitions[page.kind!].fields.some((field) => field.key === key),
        )
      )
        throw new HttpError(400, "현재 탭에 없는 필드는 저장할 수 없습니다.");
      if (
        input.structure !== undefined &&
        (!input.structure ||
          typeof input.structure !== "object" ||
          Array.isArray(input.structure))
      )
        throw new HttpError(400, "structure는 객체여야 합니다.");
      await checkpoint?.();
      const change = {
          kind: page.kind,
          title: input.title ?? before?.title,
          status: input.status ?? before?.status ?? "초안",
          fields: { ...before?.fields, ...fields },
          links: input.links ?? before?.links ?? [],
          structure: {
            ...before?.structure,
            ...(input.structure as Record<string, unknown> | undefined),
          },
          version: input.version,
        };
      // Validate through the real mutation path in a short transaction, then discard the preview.
      // No transaction remains open while waiting for the model or guardrail classifier.
      const previewTx = await db().transaction("write");
      let saved;
      try {
        saved = await mutateArtifact(request, user, context.projectId, change, action, before?.id, checkpoint, previewTx);
      } finally { await previewTx.rollback(); previewTx.close(); }
      pending.push({ input: change, action, id: before?.id });
      seen.add(signature);
      const result = {
        action,
        id: saved.id,
        code: saved.code,
        title: saved.title,
        version: saved.version,
      };
      return { success: true, pending: true, action: result.action, title: result.title,
        message: "검증된 변경안입니다. 최종 출력 검사 후 저장되며 아직 DB에 반영되지 않았습니다." };
    } catch (error) {
      if (error instanceof GenerationCancelled || error instanceof GuardrailBlocked) throw error;
      return {
        success: false,
        status: error instanceof HttpError ? error.status : 500,
        error:
          error instanceof HttpError
            ? error.message
            : "도구 실행 중 문제가 발생했습니다.",
      };
    }
  }
  async function commit(tx: Transaction) {
    const committed: AiAction[] = [];
    if (!pending.length) return committed;
    const row = (await tx.execute({ sql: "SELECT u.account_role,u.onboarding_complete,m.role FROM users u JOIN workspace_members m ON m.user_id=u.id WHERE u.id=? AND m.workspace_id=?", args: [user.id, user.workspaceId] })).rows[0];
    if (!row) throw new HttpError(403, "워크스페이스 접근 권한이 변경되었습니다.");
    const currentUser: User = { ...user, role: String(row.role), accountRole: row.account_role as User["accountRole"], onboardingComplete: Number(row.onboarding_complete) === 1 };
    const access = await projectAccess(tx, currentUser, context.projectId, true);
    currentUser.role = String(access.role);
    for (const change of pending) {
      await checkpoint?.(tx);
      const saved = await mutateArtifact(request, currentUser, context.projectId, change.input, change.action, change.id, checkpoint, tx);
      committed.push({ action: change.action, id: saved.id, code: saved.code, title: saved.title, version: saved.version });
    }
    return committed;
  }
  return { tools, execute, actions, commit, pendingCount: () => pending.length };
}
