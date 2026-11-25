import type { DocumentFormat } from "./document-formats";
export type Mode = "chat" | "image" | "file";
export type Settings = {
  themePreset: string;
  language: "ko" | "en";
  truncateLongResponses: boolean;
  inputPlaceholder: string;
  version: number;
};
export type Conversation = { id: string; title: string; version: number };
export type ModelList = {
  models: { id: string; capabilities: string[] }[];
  defaultModel: string;
};
export type Artifact = {
  format?: DocumentFormat;
  id: string;
  versionId: string;
  title: string;
  kind: string;
  version: number;
  url: string;
};
export type Review = {
  id: string;
  kind: string;
  version: number;
  status: string;
  before?: string;
  after?: string;
  summary: string;
};
export type Approval = {
  id: string;
  status: string;
  version: number;
  rules: string[];
  requestId: string;
};
export type Message = {
  clarifications?: Clarification[];
  id: string;
  seq: number;
  role: string;
  text: string;
  status: string;
  requestId?: string;
  artifact?: Artifact;
  review?: Review;
  approval?: Approval;
};
export type Clarification = {
  id: string;
  requestId: string;
  round: number;
  version: number;
  status: string;
  title: string;
  message: string;
  options: import("./decision-schema").Choice[];
  allowCustom: boolean;
  expiresAt: string;
  canAnswer: boolean;
  selected?: { field: string; label: string; value: string; intent: string };
};
export type GraphNode = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  parentNode?: string;
  parentId?: string;
};
export type Graph = {
  nodes: GraphNode[];
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
  }[];
  startNodeId?: string | null;
};
export type Run = {
  id: string;
  title: string;
  status: string;
  version: number;
  currentNode: GraphNode | null;
  slots: Record<string, unknown>;
  events: {
    seq: number;
    type: string;
    nodeId: string;
    text?: string;
    review?: Review;
    approval?: Approval;
  }[];
  nextCursor?: number | null;
  errorCode?: string;
};
