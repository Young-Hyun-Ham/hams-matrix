import type { GuardrailFinding, GuardrailStage } from "./guardrail-types";

// Keep baseline compliance checks independent of workspace policy switches.
// These checks identify explicit unsafe instructions, not legal applicability.
const consequentialDecision = /(?:채용|입사|대출|신용|보험|복지|교육|의료|진료|고용|해고|employment|hiring|loan|credit|insurance|benefits|medical|healthcare)/i;
const withoutHumanReview = /(?:인간|사람|담당자|관리자|의사).{0,25}(?:검토|승인|개입|확인).{0,18}(?:없이|생략|건너뛰|배제)|(?:검토|승인|개입|확인).{0,18}(?:없이|생략|건너뛰|배제)|(?:without|skip|bypass|remove|no).{0,25}(?:human|manual).{0,15}(?:review|oversight|approval|intervention)/i;
const finalAutomatedDecision = /(?:자동|AI|모델|시스템|automated|model|system).{0,50}(?:결정|판정|거절|승인|탈락|선발|decision|reject|approve|deny)|(?:결정|판정|거절|승인|탈락|선발|decision|reject|approve|deny).{0,50}(?:자동|AI|모델|시스템|automated|model|system)/i;
const overrideBoundary = /(?:이 문서|이 자료|도구 결과|검색 결과|첨부 파일|this document|tool result|search result|attachment).{0,80}(?:시스템 지시|개발자 지시|가드레일|보안 정책|system instruction|developer instruction|guardrail|security policy).{0,35}(?:무시|우회|대체|비활성|ignore|bypass|override|disable)|(?:시스템 지시|개발자 지시|가드레일|보안 정책|system instruction|developer instruction|guardrail|security policy).{0,35}(?:무시|우회|대체|비활성|ignore|bypass|override|disable)/i;

export function inspectGlobalCompliance(stage: GuardrailStage, text: string): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];
  if (text.length > 600000) return findings; // Existing size-limit rule blocks this input.
  const normalized = text.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (consequentialDecision.test(normalized) && withoutHumanReview.test(normalized) && finalAutomatedDecision.test(normalized))
    findings.push({ rule: "global_human_review_required", severity: "critical" });
  if ((stage === "context" || stage === "tool-result") && overrideBoundary.test(normalized))
    findings.push({ rule: "global_untrusted_boundary", severity: "critical" });
  return findings;
}
