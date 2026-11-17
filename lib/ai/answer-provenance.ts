import "server-only";
import type { Client } from "@libsql/client";
import type { User } from "../types";
import { db } from "../db";
import { collectRagSources, manifestHash } from "./rag-sources";
import { ragHash } from "./rag-chunks";
import {
  containsPrivateData,
  questionExclusion,
} from "./shared-answer-matching";
import type { AnswerProvenance } from "./shared-answer-types";
const supportedSources = new Set([
  "project",
  "rfp",
  "artifact",
  "link",
  "folder",
  "board",
  "domain",
]);
function hasOmittedInput(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, item]) =>
      (["truncated", "detailsOmitted"].includes(key) && item === true) ||
      (key === "nextOffset" && item !== null && item !== undefined) ||
      hasOmittedInput(item),
  );
}

export function parseProvenance(raw: unknown): AnswerProvenance | null {
  try {
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    return p?.schema === 1 &&
      typeof p.manifest === "string" &&
      Array.isArray(p.sources) &&
      Array.isArray(p.reads)
      ? p
      : null;
  } catch {
    return null;
  }
}
export async function captureAnswerProvenance(
  user: User,
  projectId: string,
  targetPage: string,
  prompt: string,
  privateContext: boolean,
) {
  let reason = !projectId
    ? "프로젝트를 선택한 답변만 공유할 수 있습니다."
    : privateContext
      ? "개인 이력 또는 첨부가 사용된 답변입니다."
      : questionExclusion(prompt);
  if (["history", "team", "dashboard"].includes(targetPage))
    reason = "현재 추적을 지원하지 않는 AI 대상입니다.";
  const sources = reason ? [] : await collectRagSources(user, projectId);
  // Files have no immutable content digest yet; snapshots can contain private historical authors.
  if (sources.some((s) => s.file || !supportedSources.has(s.type)))
    reason =
      "파일·과거 출처 또는 미지원 자료의 불변성과 개인정보를 확인할 수 없습니다.";
  if (
    sources.some((s) => containsPrivateData(s.text)) ||
    containsPrivateData(prompt)
  )
    reason = "참고 자료에 개인 정보 또는 민감정보가 포함되어 있습니다.";
  const provenance: AnswerProvenance = {
    schema: 1,
    complete: !reason,
    reason,
    manifest: manifestHash(sources),
    sources: sources.map((s) => ({
      type: s.type,
      id: s.id,
      version: s.version,
      hash: s.hash,
      tab: s.tab,
      title: s.title,
      href: s.href,
    })),
    targetPage,
    generatedAt: new Date().toISOString(),
    reads: [],
  };
  return {
    provenance,
    observe(name: string, input: unknown, output: unknown) {
      if (
        ![
          "page_context",
          "rag_context",
          "read_page",
          "read_database_domains",
          "read_project_artifact",
          "read_project_rfp",
        ].includes(name) ||
        containsPrivateData(output) ||
        hasOmittedInput(output) ||
        (output as { success?: boolean })?.success === false
      ) {
        provenance.complete = false;
        provenance.reason =
          "개인 정보·실행·미추적 도구 또는 생략된 자료가 사용된 답변입니다.";
      }
      provenance.reads.push({
        name,
        inputHash: ragHash(input),
        outputHash: ragHash(output ?? null),
      });
    },
    finish(result: string, execution: boolean) {
      if (execution || containsPrivateData(result)) {
        provenance.complete = false;
        provenance.reason =
          "개인 정보 또는 업무 실행 결과가 포함된 답변입니다.";
      }
      if (
        /(?:오늘|어제|내일|지금|이번\s*(?:주|달|월|분기|해)|지난\s*(?:주|달|월|분기|해)|다음\s*(?:주|달|월|분기|해)|\b(?:today|yesterday|tomorrow|next week|last week)\b)/i.test(
          result,
        )
      ) {
        provenance.complete = false;
        provenance.reason =
          "시간에 따라 의미가 달라지는 표현이 포함된 답변입니다.";
      }
      return provenance;
    },
  };
}
export async function validateAnswerProvenance(
  user: User,
  projectId: string,
  p: AnswerProvenance,
  executor: Pick<Client, "execute"> = db(),
) {
  if (!p.complete || p.schema !== 1 || !p.sources.length) return false;
  const current = await collectRagSources(user, projectId, executor);
  if (
    current.some(
      (s) =>
        s.file || !supportedSources.has(s.type) || containsPrivateData(s.text),
    )
  )
    return false;
  const map = new Map(current.map((s) => [`${s.type}:${s.id}`, s]));
  return (
    manifestHash(current) === p.manifest &&
    p.sources.every((s) => {
      const value = map.get(`${s.type}:${s.id}`);
      return (
        value?.version === s.version &&
        value.hash === s.hash &&
        value.tab === s.tab
      );
    })
  );
}
