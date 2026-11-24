import type { GuardrailFinding } from "./guardrail-types";

export const guardrailNames: Record<string, string> = {
  custom_blocked_term: "사용자 지정 차단 문구",
  external_link: "외부 링크 제한",
  instruction_override: "지시 변경 탐지",
  secret_extraction: "비밀정보 유출 방지",
  sensitive_data: "민감정보 보호",
  server_secret: "서버 비밀정보 보호",
  unsafe_markup: "위험한 마크업 차단",
  classifier_injection: "AI 지시 변경 분류",
  classifier_exfiltration: "AI 정보 유출 분류",
  classifier_privilege_escalation: "AI 권한 상승 분류",
  classifier_unavailable: "필수 AI 검사 실패",
  global_human_review_required: "사람 검토 보장",
  global_untrusted_boundary: "신뢰 경계 보호",
  inspection_size_limit: "검사 크기 제한",
  image_disabled: "이미지 첨부 차단",
  image_inspection_limit: "이미지 검사 한도",
};
const reviewable = new Set([
  "custom_blocked_term",
  "external_link",
  "instruction_override",
  "classifier_injection",
  "classifier_exfiltration",
  "classifier_privilege_escalation",
]);
export function approvalEligible(findings: GuardrailFinding[]) {
  return (
    findings.length > 0 &&
    findings.every((f) => f.severity !== "critical" && reviewable.has(f.rule))
  );
}
export const policyNames = (findings: GuardrailFinding[]) =>
  findings.map((f) => ({
    ...f,
    displayName: guardrailNames[f.rule] ?? "필수 보호 정책",
  }));
export function inspectionExcerpt(value: unknown, terms: string[]) {
  const text = (
    typeof value === "string" ? value : (JSON.stringify(value) ?? "")
  )
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  const offsets = terms
    .map((term) =>
      text.toLowerCase().indexOf(term.normalize("NFKC").toLowerCase()),
    )
    .filter((i) => i >= 0);
  const url = text.search(/https?:\/\//i);
  if (url >= 0) offsets.push(url);
  if (!offsets.length) return maskedExcerpt(text);
  return offsets
    .slice(0, 4)
    .map((i) => maskedExcerpt(text.slice(Math.max(0, i - 200), i + 500), 700))
    .join("\n…\n")
    .slice(0, 2000);
}
export function maskedExcerpt(value: unknown, max = 2000) {
  let text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  for (const name of [
    "OPENAI_API_KEY",
    "TURSO_AUTH_TOKEN",
    "R2_SECRET_ACCESS_KEY",
    "AI_IMAGE_ENCRYPTION_KEY",
    "AI_CREDENTIAL_ENCRYPTION_KEY",
    "ONLYOFFICE_JWT_SECRET",
  ]) {
    const secret = process.env[name];
    if (secret && secret.length >= 12)
      text = text.split(secret).join("[비밀정보 숨김]");
  }
  return text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
      "[비밀키 숨김]",
    )
    .replace(
      /(["']?(?:password|passwd|secret|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      "$1[비밀정보 숨김]",
    )
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[이미지]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[API 키 숨김]")
    .replace(/\b\d{6}-[1-4]\d{6}\b/g, "[개인정보 숨김]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일 숨김]")
    .replace(/(?:Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "Bearer [숨김]")
    .replace(
      /([?&](?:token|key|secret|password|api_key)=)[^&#\s"']+/gi,
      "$1[숨김]",
    )
    .slice(0, max);
}
