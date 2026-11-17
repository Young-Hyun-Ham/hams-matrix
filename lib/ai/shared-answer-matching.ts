import type { QuestionContract } from "./shared-answer-types";

// Do not erase negation, dates, numbers, filters or punctuation inside IDs.
export function normalizeSharedQuestion(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ko-KR")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?？]+$/, "")
    .trim();
}
export function questionExclusion(value: string): string | null {
  if (
    /(?:현재|지금|오늘|최신|실시간|지난|이번|다음|어제|내일|최근|금주|전주|기준일|기준 시|진행률|진척률|건수|몇\s*(?:개|건|명)|\d{4}[./년-]|\d+\s*(?:일|주|월|년)\s*(?:전|후|동안)|\b(?:current|today|latest|last|next|yesterday|progress|as of)\b)/i.test(
      value,
    )
  )
    return "기간·최신 상태 질문은 공유 등록 및 자동 반환 대상이 아닙니다.";
  if (
    /(?:(?:^|\s)(?:내|저의|나의|제|우리)(?=\s|$)|이거|그거|이것|그것|계속|내가|저번|아까|이전\s*대화|앞서|그\s*(?:문서|요구사항|화면)|담당자|연락처|이메일|전화번호|개인정보|실명|\b(?:my|me|previous conversation)\b)/i.test(
      value,
    )
  )
    return "개인 정보·대화 문맥에 의존하는 질문은 공유할 수 없습니다.";
  if (
    /(?:등록|저장|추가|수정|변경|삭제|제거|승인|반려|적용|작성|생성|만들).{0,5}(?:해|하|줘|부탁|요청)|\b(?:create|save|update|edit|delete|remove|approve|apply)\b/i.test(
      value,
    )
  )
    return "업무 실행 요청은 공유 답변으로 대신 처리하지 않습니다.";
  if (
    /(?:이|그|해당|선택한)\s*(?:문서|화면|항목|요구사항|탭|프로그램|작업)/.test(
      value,
    )
  )
    return "화면 선택에 의존하는 대상은 공유할 수 없습니다. 관리번호로 명시해 주세요.";
  if (
    !questionSubjects(value).length &&
    !/프로젝트|제안요청서|\b(?:project|rfp)\b/i.test(value)
  )
    return "공유할 질문의 대상을 관리번호·프로젝트·제안요청서로 명시해 주세요.";
  return null;
}
export function containsPrivateData(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:01[016789][- .]?\d{3,4}[- .]?\d{4}|\d{6}-[1-4]\d{6})\b|\bsk-(?:proj-)?[\w-]{16,}|-----BEGIN .*PRIVATE KEY-----|(?:비밀번호|password|api[_ -]?key|access[_ -]?token)\s*[:=]/i.test(
    text,
  );
}
export function questionSubjects(value: string) {
  return [
    ...new Set(value.toUpperCase().match(/\b[A-Z][A-Z0-9]*-\d+\b/g) ?? []),
  ].sort();
}
export function questionPresentation(value: string) {
  return [
    /영어|english/i.test(value) ? "en" : "ko",
    /표로|표\s*형식|table/i.test(value) ? "table" : "text",
    /요약|간단|summary/i.test(value) ? "summary" : "detail",
  ].join(":");
}
function conditionWords(value: string) {
  // Conservative hard conflict detection. Broader semantic matches are suggestions only.
  return (
    value.match(
      /\S+(?:팀|조직|단계|상태)|미완료|완료|미승인|승인|제외|포함|전체|개발|설계|분석|테스트|필수|선택|아닌|않|없|있|only|except|not|all/gi,
    ) ?? []
  )
    .map((v) => v.toLowerCase())
    .sort()
    .join("|");
}
export function questionContract(
  question: string,
  conditions: string,
): QuestionContract {
  return {
    schema: 1,
    subjectIds: questionSubjects(question),
    temporal: "none",
    conditions,
    presentation: questionPresentation(question),
    scope: "project",
  };
}
export function compatibleSharedQuestion(a: string, b: string) {
  return (
    !questionExclusion(a) &&
    !questionExclusion(b) &&
    JSON.stringify(questionSubjects(a)) ===
      JSON.stringify(questionSubjects(b)) &&
    JSON.stringify(a.match(/\d+/g) ?? []) ===
      JSON.stringify(b.match(/\d+/g) ?? []) &&
    conditionWords(a) === conditionWords(b) &&
    questionPresentation(a) === questionPresentation(b)
  );
}
export function relatedSharedQuestion(a: string, b: string) {
  if (!compatibleSharedQuestion(a, b)) return false;
  const words = (v: string) =>
    new Set(
      normalizeSharedQuestion(v)
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 2),
    );
  const left = words(a),
    right = words(b);
  const common = [...left].filter((w) => right.has(w));
  return (
    common.length >= 2 || (common.length >= 1 && questionSubjects(a).length > 0)
  );
}
