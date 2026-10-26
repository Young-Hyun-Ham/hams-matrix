import "server-only";
import { HttpError, requireWriter } from "../auth";
import { mutateArtifact, projectAccess, toArtifact } from "../artifacts";
import { db } from "../db";
import type { User } from "../types";
import type { AiContext } from "../ai-context";
import type { AiPage } from "./page-prompts";
import { readAiPage } from "./page-data";
import { definitions } from "../artifact-types";
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
) {
  const actions: AiAction[] = [],
    seen = new Set<string>();
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
      if (name === "read_page")
        return { success: true, data: await readAiPage(user, context, page) };
      if (name !== "save_artifact" || !page.kind || !canWrite)
        throw new HttpError(
          403,
          "현재 화면 또는 권한에서는 이 도구를 사용할 수 없습니다.",
        );
      requireWriter(user);
      const action = input.action;
      if (action !== "CREATE" && action !== "UPDATE" && action !== "DELETE")
        throw new HttpError(400, "작업 유형을 확인해 주세요.");
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
      if (actions.length >= 3)
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
      const saved = await mutateArtifact(
        request,
        user,
        context.projectId,
        {
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
        },
        action,
        before?.id,
      );
      seen.add(signature);
      const result = {
        action,
        id: saved.id,
        code: saved.code,
        title: saved.title,
        version: saved.version,
      };
      actions.push(result);
      return { success: true, ...result };
    } catch (error) {
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
  return { tools, execute, actions };
}
