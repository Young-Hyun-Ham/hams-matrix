export const intentNames: Record<string, string> = {
  rag: "프로젝트 지식 검색(RAG)",
  realtime: "현재 데이터 조회",
  execution: "변경 실행 요청",
};
export type IntentReference = {
  sourceType: string;
  sourceId: string;
  version: string;
  chunkId: string;
};
export type IntentKnowledge = IntentReference & {
  title: string;
  titleOrigin: "indexed" | "current" | "unavailable";
  category: string;
  excerpt: string | null;
  section: string | null;
  currentTitle: string | null;
  currentVersion: string | null;
  changed: boolean;
};
export const searchStatus = (item: {
  referenceCount: number;
  fallbackCode: string | null;
  flags: { needsRag: boolean | null; needsClarification: boolean | null };
}) => {
  if (item.flags.needsClarification) return "확인 질문 필요";
  if (item.fallbackCode === "NO_RELEVANT_EVIDENCE") return "관련 근거 없음";
  if (item.fallbackCode === "INDEX_NOT_BUILT") return "검색본 미생성";
  if (item.fallbackCode === "INDEX_STALE") return "자료 변경 · 재벡터화 필요";
  if (item.fallbackCode === "SEARCH_BUDGET_EXCEEDED")
    return "검색 시간 한도 초과";
  if (item.fallbackCode === "RAG_UNAVAILABLE") return "검색 실패 · 대체 처리";
  if (item.fallbackCode) return "검색 대체 처리";
  if (item.referenceCount) return "검색 근거 참조";
  return item.flags.needsRag === false ? "검색 불필요" : "검색 근거 기록 없음";
};
export const displayVersion = (value: string) => {
  if (!value) return "기록 없음";
  if (/^\d+$/.test(value)) return `v${value}`;
  if (/^[a-f0-9]{64}$/i.test(value))
    return `변경 식별자 ${value.slice(0, 12)}…`;
  return value;
};
export type IntentClassification = {
  eventId: string;
  createdAt: string;
  primaryIntent: string;
  classifierVersion: number;
  flags: {
    needsRag: boolean | null;
    needsRealtime: boolean | null;
    needsExecution: boolean | null;
    needsClarification: boolean | null;
  };
  reasonCode: string;
  fallbackCode: string | null;
  durationMs: number;
  referenceCount: number;
  knowledge: IntentKnowledge[];
};
export type IntentClassificationDetail = IntentClassification & {
  generationId: string | null;
  references: IntentKnowledge[];
};
export type IntentClassificationList = {
  events: IntentClassification[];
  nextCursor: string | null;
};
export type RagFailureList = {
  failures: {
    jobId: string;
    generationId: string;
    configVersion: number;
    model: string;
    createdAt: string;
    finishedAt: string | null;
    errorCode: string | null;
    processedSources: number;
    totalSources: number;
    completedChunks: number;
    totalChunks: number;
  }[];
  nextCursor: string | null;
};
export type IntentReferenceDetail = {
  reference: IntentReference;
  source: {
    title: string;
    version: string;
    content: string;
    href: string;
    changed: boolean;
  } | null;
  chunk: { section: string; content: string } | null;
};
export type ConsoleCapability = {
  userId: string;
  workspaceId: string;
  projectId: string;
  canOpen: boolean;
  projects: { id: string; name: string }[];
};
