export const intentNames: Record<string, string> = {
  rag: "프로젝트 지식 검색(RAG)",
  realtime: "현재 데이터 조회",
  execution: "변경 실행 요청",
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
};
export type IntentClassificationDetail = IntentClassification & {
  generationId: string | null;
  references: {
    sourceType: string;
    sourceId: string;
    version: string;
    chunkId: string;
  }[];
};
export type IntentClassificationList = {
  events: IntentClassification[];
  nextCursor: string | null;
};
export type IntentReferenceDetail = {
  reference: IntentClassificationDetail["references"][number];
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
