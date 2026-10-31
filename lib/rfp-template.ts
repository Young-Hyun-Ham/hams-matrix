import { requirementCategories } from "./artifact-types";
import type { RfpDraft, RfpRequirement } from "./rfp-types";

export const RFP_SECTIONS = [
  { id: "basic", title: "사업 개요", hint: "사업의 배경과 목적을 먼저 정리하세요." },
  { id: "scope", title: "추진 범위", hint: "포함 범위와 제외 범위를 구분하세요." },
  { id: "requirements", title: "세부 요구사항", hint: "발주 측 원본 요구사항을 항목별로 작성하세요." },
  { id: "delivery", title: "수행 및 관리", hint: "일정과 산출물, 품질·보안 관리 방안을 작성하세요." },
  { id: "proposalGuide", title: "제안 안내", hint: "제안서 제출 조건과 안내 정보를 입력하세요." },
  { id: "evaluation", title: "평가 기준", hint: "평가 항목과 배점을 필요에 따라 작성하세요." },
  { id: "appendix", title: "부록", hint: "용어와 참고자료를 정리하세요." },
] as const;

export type RfpSectionId = (typeof RFP_SECTIONS)[number]["id"];

export const RFP_FIELDS = {
  basic: [
    { key: "organization", label: "발주기관", required: true },
    { key: "startDate", label: "사업 시작일", type: "date" },
    { key: "endDate", label: "사업 종료일", type: "date" },
    { key: "budget", label: "예산", type: "number" },
    { key: "background", label: "추진 배경", required: true, multiline: true },
    { key: "objectives", label: "사업 목표", required: true, multiline: true },
  ],
  scope: [
    { key: "currentState", label: "현황", multiline: true },
    { key: "targetUsers", label: "대상 사용자" },
    { key: "included", label: "구축 범위", required: true, multiline: true },
    { key: "excluded", label: "제외 범위", multiline: true },
    { key: "expectedEffects", label: "기대 효과", multiline: true },
  ],
  delivery: [
    { key: "organization", label: "수행 조직", multiline: true },
    { key: "quality", label: "품질 관리", multiline: true },
    { key: "security", label: "보안 관리", multiline: true },
    { key: "risks", label: "위험 관리", multiline: true },
    { key: "support", label: "운영 지원", multiline: true },
  ],
  proposalGuide: [
    { key: "documents", label: "제출 문서", multiline: true },
    { key: "method", label: "제출 방법", multiline: true },
    { key: "deadline", label: "제출 기한", type: "date" },
    { key: "contact", label: "문의처" },
    { key: "outline", label: "제안서 목차", multiline: true },
  ],
  appendix: [
    { key: "glossary", label: "용어", multiline: true },
    { key: "references", label: "참고자료", multiline: true },
    { key: "notes", label: "추가 설명", multiline: true },
  ],
} as const;

export const RFP_REQUIREMENT_FIELDS = [
  { key: "number", label: "원본 번호", required: true },
  { key: "category", label: "분류", required: true },
  { key: "title", label: "제목", required: true },
  { key: "definition", label: "정의", multiline: true },
  { key: "details", label: "세부 내용", required: true, multiline: true },
  { key: "outputs", label: "산출정보", multiline: true },
  { key: "acceptance", label: "검수 기준", multiline: true },
] as const;

export const RFP_CATEGORIES = Object.entries(requirementCategories).map(
  ([code, label]) => ({ code, label }),
);

export function createRfpSample(projectId: string, projectName: string): RfpDraft {
  return {
    schemaVersion: 1,
    projectId,
    title: `${projectName} 제안요청서`,
    basic: {
      organization: "",
      startDate: "",
      endDate: "",
      budget: "",
      background: "기존 업무 절차와 정보 공유 방식을 개선하기 위한 시스템 구축을 검토합니다.",
      objectives: "업무 현황을 한곳에서 파악하고 협업에 필요한 정보를 일관되게 관리합니다.",
    },
    scope: {
      currentState: "현재 업무 환경과 개선이 필요한 과정을 구체적으로 작성해 주세요.",
      targetUsers: "",
      included: "사용자 업무 화면, 데이터 관리, 운영자 기능을 구축 범위로 검토합니다.",
      excluded: "",
      expectedEffects: "",
    },
    requirements: [
      {
        id: "sample-requirement-1",
        number: "RFP-SFR-001",
        category: "SFR",
        title: "업무 현황 조회",
        definition: "사용자가 담당 업무의 현황을 확인합니다.",
        details: "사용자는 자신이 접근할 수 있는 업무 목록과 진행 상태를 조회할 수 있어야 합니다.",
        outputs: "업무 목록 및 상태",
        acceptance: "권한이 있는 업무만 표시되는지 확인합니다.",
      },
    ],
    delivery: {
      schedule: [{ id: "sample-schedule-1", phase: "분석", period: "기간 미정", deliverable: "요구사항 정의서" }],
      organization: "",
      quality: "",
      security: "",
      risks: "",
      support: "",
    },
    proposalGuide: { documents: "", method: "", deadline: "", contact: "", outline: "" },
    evaluation: [],
    appendix: { glossary: "", references: "", notes: "" },
  };
}

export function createEmptyRfp(projectId: string, projectName = ''): RfpDraft {
  const sample = createRfpSample(projectId, projectName);
  return {schemaVersion:1,projectId,title:projectName ? `${projectName} 제안요청서` : '',
    basic:Object.fromEntries(Object.keys(sample.basic).map(k=>[k,''])) as RfpDraft['basic'],
    scope:Object.fromEntries(Object.keys(sample.scope).map(k=>[k,''])) as RfpDraft['scope'],requirements:[],
    delivery:{schedule:[],organization:'',quality:'',security:'',risks:'',support:''},
    proposalGuide:{documents:'',method:'',deadline:'',contact:'',outline:''},evaluation:[],appendix:{glossary:'',references:'',notes:''}};
}

const hasText = (value: string) => value.trim().length > 0;

export function rfpSectionStatus(draft: RfpDraft, section: RfpSectionId) {
  if (section === "requirements") {
    if (!draft.requirements.length) return "미작성";
    return draft.requirements.every(requirementIsComplete) ? "입력 완료" : "작성 중";
  }
  if (section === "evaluation") return draft.evaluation.length ? "입력 완료" : "미작성";
  const values = section === "delivery"
    ? [...Object.values(draft.delivery).filter((value): value is string => typeof value === "string"), ...draft.delivery.schedule.flatMap((row) => [row.phase, row.period, row.deliverable])]
    : Object.values(draft[section]);
  const filled = values.some(hasText);
  if (!filled) return "미작성";
  if (section === "basic" && ![draft.title, draft.basic.organization, draft.basic.background, draft.basic.objectives].every(hasText)) return "작성 중";
  if (section === "scope" && !hasText(draft.scope.included)) return "작성 중";
  if (section === "delivery" && !draft.delivery.schedule.some((row) => hasText(row.phase) && hasText(row.period) && hasText(row.deliverable))) return "작성 중";
  return "입력 완료";
}

function requirementIsComplete(row: RfpRequirement) {
  return [row.number, row.category, row.title, row.details].every(hasText);
}

export function rfpRequiredProgress(draft: RfpDraft) {
  const required = [
    draft.title,
    draft.basic.organization,
    draft.basic.background,
    draft.basic.objectives,
    draft.scope.included,
    draft.delivery.schedule.some((row) => [row.phase, row.period, row.deliverable].every(hasText)) ? "yes" : "",
    draft.requirements.length ? "yes" : "",
    draft.requirements.length && draft.requirements.every(requirementIsComplete) ? "yes" : "",
  ];
  return { completed: required.filter(hasText).length, total: required.length };
}

export function rfpValidation(draft: RfpDraft) {
  const issues: { section: RfpSectionId; message: string }[] = [];
  if (draft.basic.startDate && draft.basic.endDate && draft.basic.startDate > draft.basic.endDate) issues.push({ section: "basic", message: "사업 시작일은 종료일보다 늦을 수 없습니다." });
  if (draft.basic.budget && (!Number.isFinite(Number(draft.basic.budget)) || Number(draft.basic.budget) < 0)) issues.push({ section: "basic", message: "예산은 0 이상의 숫자로 입력하세요." });
  const numbers = new Set<string>();
  for (const row of draft.requirements) {
    const number = row.number.trim().toLowerCase();
    if (number && numbers.has(number)) issues.push({ section: "requirements", message: `원본 번호 ${row.number}가 중복됩니다.` });
    numbers.add(number);
    if (!requirementIsComplete(row)) issues.push({ section: "requirements", message: `${row.title || "제목 없는 요구사항"}의 필수 입력을 확인하세요.` });
  }
  for (const row of draft.evaluation) {
    if (row.points && (!Number.isFinite(Number(row.points)) || Number(row.points) < 0)) issues.push({ section: "evaluation", message: `${row.criterion || "평가 항목"}의 배점은 0 이상의 숫자여야 합니다.` });
  }
  return issues;
}
