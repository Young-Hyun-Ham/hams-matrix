export type AiCallEvent = {
  turn: number;
  status: string;
  httpStatus?: number;
  responseId?: string;
  model?: string;
  usage?: unknown;
  reservedTokens?: number;
  durationMs?: number;
  purpose?:
    | "generation"
    | "guardrail"
    | "title"
    | "orchestration"
    | "embedding_query"
    | "embedding_index";
};
export type TokenTotals = {
  input: number;
  output: number;
  total: number;
  cached: number;
  reasoning: number;
  calls: number;
  requests: number;
  unknown: number;
  guardrail: number;
  orchestration: number;
  embedding: number;
};
export type TokenBucket = TokenTotals & { key: string; label: string };
export type TokenStatistics = {
  timezone: string;
  totals: TokenTotals;
  series: TokenBucket[];
  projects: { id: string; name: string }[];
  conversations: {
    id: string;
    projectId: string;
    title: string;
    deleted: boolean;
  }[];
  years: number[];
};
