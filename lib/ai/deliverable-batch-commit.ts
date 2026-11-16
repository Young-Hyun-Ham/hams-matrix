import "server-only";
import { randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import { HttpError } from "../auth";
import type { User } from "../types";
import {
  allowedLinks,
  definitions,
  type Artifact,
  type ArtifactKind,
  type SourceReference,
} from "../artifact-types";
import {
  validateArtifactInput,
  persistArtifactRow,
  syncArtifactLinks,
  recordArtifactChange,
} from "../artifacts";
import { prepareStructure, validateProjectGraph } from "../artifact-validation";
import { requireProjectPermission } from "../project-permissions";
import { saveArtifactSources } from "../source-references";
export const deliverableKinds = [
  "wbs",
  "requirement",
  "screen",
  "function",
  "database",
  "program",
] as const;
export type PlannedItem = {
  clientRef: string;
  kind: ArtifactKind;
  title: string;
  purpose: string;
  summary: string;
  definition: string;
  details: string;
  category: string;
  links: string[];
  sourceIndex: number;
  excerpt: string;
  rationale: string;
  origin: "원문 명시" | "설계 도출";
  reuseId?: string;
};
export function validateDeliverablePlan(
  value: unknown,
  targets: readonly string[],
  max: number,
): PlannedItem[] {
  if (!Array.isArray(value) || value.length > max || value.length > 100)
    throw new HttpError(400, "생성 항목 수가 관리자 변경 한도를 넘었습니다.");
  const refs = new Set<string>();
  const aliases = new Map<string, string>();
  const items = value.map((v, index) => {
    const invalid = (field: string, reason: string): never => {
      throw new HttpError(
        400,
        "생성 문서 " + (index + 1) + "번째 항목의 " + field + ": " + reason,
        {
          code: "GENERATION_VALIDATION_FAILED",
          index,
          field,
        },
      );
    };
    if (!v || typeof v !== "object" || Array.isArray(v))
      invalid("문서 형식", "객체가 필요합니다.");
    const p = v as PlannedItem;
    if (
      !deliverableKinds.includes(p.kind as (typeof deliverableKinds)[number]) ||
      !targets.includes(p.kind)
    )
      invalid("문서 종류(kind)", "선택한 산출물 종류가 아닙니다.");
    if (
      typeof p.clientRef !== "string" ||
      !/^@?[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(p.clientRef)
    )
      invalid(
        "임시 ID(clientRef)",
        "영문자로 시작하는 영문·숫자·밑줄·하이픈 1~64자가 필요합니다.",
      );
    // IDs are server-generated at commit. These aliases only join this generation's items.
    const ref = p.clientRef.startsWith("@") ? p.clientRef : "@" + p.clientRef;
    if (refs.has(ref))
      invalid("임시 ID(clientRef)", "동일한 임시 ID가 중복되었습니다.");
    refs.add(ref);
    aliases.set(ref, ref);
    aliases.set(ref.slice(1), ref);
    for (const field of [
      "title",
      "purpose",
      "summary",
      "definition",
      "details",
      "category",
      "excerpt",
      "rationale",
    ] as const) {
      if (typeof p[field] !== "string" || p[field].length > 3000)
        invalid(field, "3,000자 이하 문자열이 필요합니다.");
    }
    for (const field of ["title", "purpose", "summary"] as const)
      if (!p[field].trim()) invalid(field, "초안 필수값이 비어 있습니다.");
    if (p.title.length > 200) invalid("title", "제목은 200자 이하여야 합니다.");
    if (
      !Array.isArray(p.links) ||
      p.links.length > 200 ||
      p.links.some((x) => typeof x !== "string")
    )
      invalid("연결 문서(links)", "문자열 목록이 필요합니다(최대 200개).");
    if (!Number.isInteger(p.sourceIndex) || p.sourceIndex < 0)
      invalid("원본 번호(sourceIndex)", "0 이상의 정수가 필요합니다.");
    if (!["원문 명시", "설계 도출"].includes(p.origin))
      invalid("근거 구분(origin)", "원문 명시 또는 설계 도출이어야 합니다.");
    // Use the same skeleton rules as manual save before accepting the generated plan.
    try {
      validateArtifactInput(
        {
          title: p.title,
          status: "초안",
          detailLevel: "skeleton",
          links: [],
          fields: {
            purpose: p.purpose,
            summary: p.summary,
            definition: p.definition,
            details: p.details,
            ...(p.kind === "requirement" ? { category: p.category } : {}),
          },
        },
        p.kind,
      );
    } catch (error) {
      invalid(
        "초안 필수값",
        error instanceof HttpError
          ? error.message
          : "저장 형식을 확인해 주세요.",
      );
    }
    return { ...p, clientRef: ref, reuseId: undefined };
  });
  // Rewrite declared aliases only. Existing artifact IDs and undeclared references stay intact.
  return items.map((p) => ({
    ...p,
    links: p.links.map((id) => aliases.get(id) ?? id),
  }));
}
export function resolveDeliverableEvidence(
  items: PlannedItem[],
  sources: readonly { content: string }[],
) {
  const warnings: { clientRef: string; message: string }[] = [];
  const resolved = items.map((item, index) => {
    const source = sources[item.sourceIndex];
    if (!source)
      throw new HttpError(
        400,
        "생성 문서 " +
          (index + 1) +
          "번째 항목의 원본 번호가 유효하지 않습니다.",
      );
    if (!item.excerpt || source.content.includes(item.excerpt)) return item;
    if (item.origin === "원문 명시")
      throw new HttpError(
        400,
        "생성 문서 " +
          (index + 1) +
          "번째 항목의 직접 인용이 원문과 일치하지 않습니다.",
      );
    // Derived summaries are not quotations. Keep the original source and make the fallback visible.
    warnings.push({
      clientRef: item.clientRef,
      message:
        "생성 문서 " +
        (index + 1) +
        "번째 항목: 설계 근거 요약을 직접 인용으로 확인할 수 없어 전체 원문을 출처로 연결했습니다. 상세에서 근거를 검토해 주세요.",
    });
    return { ...item, excerpt: "" };
  });
  return { items: resolved, warnings };
}
export async function commitDeliverables(
  tx: Transaction,
  request: Request,
  user: User,
  projectId: string,
  items: PlannedItem[],
  existing: Artifact[],
  snapshotIds: string[],
  additionalSources: SourceReference[] = [],
) {
  const aliases = new Map(
    items.map((p) => [p.clientRef, p.reuseId ?? randomUUID()]),
  );
  const planned: Artifact[] = [];
  const now = new Date().toISOString();
  for (const p of items) {
    if (p.reuseId) {
      if (!existing.some((a) => a.id === p.reuseId && a.kind === p.kind))
        throw new HttpError(409, "재사용 문서가 변경되었습니다.");
      continue;
    }
    const links = p.links.map((id) =>
      id.startsWith("@") ? aliases.get(id) : id,
    );
    if (links.some((id) => !id))
      throw new HttpError(400, "연결할 신규 문서가 없습니다.");
    const fields = {
      purpose: p.purpose,
      summary: p.summary,
      definition: p.definition,
      details: p.details,
      ...(p.kind === "requirement" ? { category: p.category } : {}),
      ...(p.kind === "wbs"
        ? {
            phase: "",
            taskType: "작업",
            progress: "0",
            plannedEffort: "",
            actualEffort: "",
          }
        : {}),
    };
    const values = validateArtifactInput(
      {
        title: p.title,
        status: "초안",
        detailLevel: "skeleton",
        fields,
        links,
      },
      p.kind,
    );
    const prefix =
      p.kind === "requirement"
        ? values.fields.category
        : definitions[p.kind].prefix;
    const sequence = await tx.execute({
      sql: "INSERT INTO project_sequences(project_id,prefix,value) VALUES (?,?,1) ON CONFLICT(project_id,prefix) DO UPDATE SET value=value+1 RETURNING value",
      args: [projectId, prefix],
    });
    const snapshotId = snapshotIds[p.sourceIndex];
    if (!snapshotId) throw new HttpError(400, "생성 문서의 근거가 없습니다.");
    const source = (
      await tx.execute({
        sql: "SELECT name FROM project_source_snapshots WHERE id=? AND project_id=? AND workspace_id=?",
        args: [snapshotId, projectId, user.workspaceId],
      })
    ).rows[0];
    if (!source) throw new HttpError(400, "생성 원본을 찾을 수 없습니다.");
    planned.push({
      id: aliases.get(p.clientRef)!,
      projectId,
      kind: p.kind,
      code: prefix + "-" + String(sequence.rows[0].value).padStart(3, "0"),
      ...values,
      structure: {},
      version: 1,
      createdAt: now,
      updatedAt: now,
      sources: [
        ...additionalSources,
        {
          snapshotId,
          locator:
            String(source.name) +
            " · " +
            (p.excerpt ? "본문 발췌" : "전체 원문"),
          excerpt: p.excerpt,
          rationale: p.rationale,
          origin: p.origin,
        },
      ],
    });
  }
  const graph = [...existing, ...planned];
  for (const a of planned) {
    for (const id of a.links) {
      const target = graph.find((x) => x.id === id);
      if (!target || id === a.id || !allowedLinks[a.kind].includes(target.kind))
        throw new HttpError(400, "허용되지 않은 문서 연결입니다.");
    }
    a.structure = prepareStructure(a, { structure: {} }, graph);
  }
  validateProjectGraph(graph);
  for (const a of planned)
    await persistArtifactRow(tx, user, a, undefined, "CREATE");
  for (const a of planned) {
    await syncArtifactLinks(tx, user, a);
    a.sources = await saveArtifactSources(tx, user, a, a.sources, "CREATE");
    await recordArtifactChange(tx, request, user, a, undefined, "CREATE");
  }
  // Reuse is explicit: preserve document content and add only the newly-created RFP provenance.
  if (additionalSources.length) {
    for (const id of new Set(
      items.flatMap((p) => (p.reuseId ? [p.reuseId] : [])),
    )) {
      const before = existing.find((a) => a.id === id)!;
      await requireProjectPermission(
        tx,
        user,
        projectId,
        before.kind,
        "UPDATE",
      );
      const after: Artifact = {
        ...before,
        version: before.version + 1,
        updatedAt: now,
        sources: [
          ...(before.sources ?? []),
          ...additionalSources.filter(
            (r) => !before.sources?.some((s) => s.snapshotId === r.snapshotId),
          ),
        ],
      };
      await persistArtifactRow(tx, user, after, before, "UPDATE");
      after.sources = await saveArtifactSources(
        tx,
        user,
        after,
        after.sources,
        "UPDATE",
      );
      await recordArtifactChange(tx, request, user, after, before, "UPDATE");
    }
  }
  return items.map((p) => {
    const a = graph.find((x) => x.id === aliases.get(p.clientRef))!;
    return {
      id: a.id,
      code: a.code,
      title: a.title,
      kind: a.kind,
      reused: !!p.reuseId,
    };
  });
}
