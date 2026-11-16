export type RagJob = {
  model: string;
  restartMode: "new" | "resume";
  resumedFromJobId: string | null;
  id: string;
  status: string;
  totalSources: number;
  processedSources: number;
  totalChunks: number;
  completedChunks: number;
  skippedSources: number;
  failedSources: number;
  errorCode: string | null;
};
export type RagSummary = {
  configVersion: number;
  canManage: boolean;
  hasCredential: boolean;
  activeGeneration: {
    id: string;
    model: string;
    dimensions: number;
    publishedAt: string;
    coverage: { unsupported?: number; sources?: number; chunks?: number };
  } | null;
  latestJob: RagJob | null;
  stale?: boolean;
};
export type RagReference = {
  chunkId: string;
  sourceType: string;
  sourceId: string;
  version: string;
  hash: string;
  title: string;
  section: string;
  href: string;
  indexedAt: string;
};
