import "server-only";
import { db } from "../db";
import type { Client } from "@libsql/client";
import { HttpError } from "../auth";
import type { User } from "../types";
import {
  defaultGuardrailPolicy,
  type GuardrailPolicy,
} from "./guardrail-types";

export function isGuardrailAdmin(user: User) {
  return (
    ["master", "admin"].includes(user.accountRole) &&
    user.onboardingComplete &&
    ["owner", "admin"].includes(user.role)
  );
}
export function requireGuardrailAdmin(user: User) {
  if (!isGuardrailAdmin(user))
    throw new HttpError(
      403,
      "워크스페이스 관리자만 가드레일을 관리할 수 있습니다.",
    );
}
export function validateGuardrailPolicy(value: unknown): GuardrailPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpError(400, "정책 형식을 확인해 주세요.");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !Object.hasOwn(defaultGuardrailPolicy, key),
    )
  )
    throw new HttpError(400, "허용하지 않은 정책 항목입니다.");
  const policy = { ...defaultGuardrailPolicy, ...input } as GuardrailPolicy;
  for (const key of [
    "aiEnabled",
    "inputEnabled",
    "contextEnabled",
    "outputEnabled",
    "injectionDetection",
    "sensitiveData",
    "blockExternalLinks",
    "classifierEnabled",
  ] as const)
    if (typeof policy[key] !== "boolean")
      throw new HttpError(400, "정책 활성화 값은 boolean이어야 합니다.");
  if (
    !["monitor", "enforce"].includes(policy.mode) ||
    !["block", "read-only", "scan"].includes(policy.imageMode)
  )
    throw new HttpError(400, "운영 모드 또는 이미지 정책을 확인해 주세요.");
  for (const key of [
    "blockedTerms",
    "allowedDomains",
    "allowedActions",
  ] as const) {
    const limit = key === "blockedTerms" ? 1000 : 50;
    if (
      !Array.isArray(policy[key]) ||
      policy[key].length > limit ||
      policy[key].some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 100,
      )
    )
      throw new HttpError(
        400,
        `${key === "blockedTerms" ? "차단 문구" : "정책 목록"}은 100자 이하 항목을 최대 ${limit}개까지 지정할 수 있습니다.`,
      );
  }
  if (
    policy.allowedActions.some(
      (v) => !["CREATE", "UPDATE", "DELETE"].includes(v),
    )
  )
    throw new HttpError(400, "변경 작업 유형을 확인해 주세요.");
  if (
    policy.allowedDomains.some(
      (v) =>
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(v),
    )
  )
    throw new HttpError(
      400,
      "허용 도메인은 경로·와일드카드 없는 호스트명으로 입력해 주세요.",
    );
  if (
    !Number.isInteger(policy.maxChanges) ||
    policy.maxChanges < 0 ||
    policy.maxChanges > 3
  )
    throw new HttpError(400, "변경 건수는 0~3건입니다.");
  if (
    typeof policy.classifierModel !== "string" ||
    policy.classifierModel.length > 100 ||
    (policy.classifierModel &&
      !/^gpt-[a-z0-9.-]+$/i.test(policy.classifierModel))
  )
    throw new HttpError(400, "검사 모델을 확인해 주세요.");
  if (
    typeof policy.classifierThreshold !== "number" ||
    !Number.isFinite(policy.classifierThreshold) ||
    policy.classifierThreshold < 0.5 ||
    policy.classifierThreshold > 1
  )
    throw new HttpError(400, "탐지 기준은 0.5~1 사이로 지정해 주세요.");
  if (policy.classifierEnabled && !policy.classifierModel)
    throw new HttpError(400, "AI 검사를 사용하려면 검사 모델을 지정해 주세요.");
  if (policy.imageMode === "scan" && !policy.classifierEnabled)
    throw new HttpError(400, "이미지 검사에는 AI 분류 검사가 필요합니다.");
  return {
    ...policy,
    allowedDomains: policy.allowedDomains.map((v) => v.toLowerCase()),
    blockedTerms: policy.blockedTerms.map((v) => v.trim()),
  };
}
export async function activeGuardrailPolicy(
  workspaceId: string,
  executor: Pick<Client, "execute"> = db(),
) {
  const row = (
    await executor.execute({
      sql: "SELECT c.active_version,p.config_json FROM ai_guardrail_configs c LEFT JOIN ai_guardrail_policies p ON p.workspace_id=c.workspace_id AND p.version=c.active_version WHERE c.workspace_id=?",
      args: [workspaceId],
    })
  ).rows[0];
  if (row?.active_version && !row.config_json)
    throw new HttpError(503, "가드레일 정책을 확인할 수 없습니다.");
  return {
    version: Number(row?.active_version ?? 0),
    policy: row?.config_json
      ? validateGuardrailPolicy(JSON.parse(String(row.config_json)))
      : { ...defaultGuardrailPolicy },
  };
}
export async function assertAiEnabled(
  workspaceId: string,
  executor?: Pick<Client, "execute">,
) {
  const { policy } = await activeGuardrailPolicy(workspaceId, executor);
  if (!policy.aiEnabled)
    throw new HttpError(403, "관리자가 AI 사용을 일시 중단했습니다.");
}
