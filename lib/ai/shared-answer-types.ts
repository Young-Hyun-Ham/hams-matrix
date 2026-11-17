import type { ProjectTab } from "../project-tabs";

export type SharedEvidence = {
  type: string;
  id: string;
  version: string;
  hash: string;
  tab: ProjectTab;
  title: string;
  href: string;
};
export type AnswerProvenance = {
  schema: 1;
  complete: boolean;
  reason: string | null;
  manifest: string;
  sources: SharedEvidence[];
  targetPage: string;
  generatedAt: string;
  reads: { name: string; inputHash: string; outputHash: string }[];
};
export type QuestionContract = {
  schema: 1;
  subjectIds: string[];
  temporal: "none";
  conditions: string;
  presentation: string;
  scope: "project";
};
export type SharedAnswer = {
  id: string;
  version: number;
  answerVersion: number;
  status: string;
  question: string;
  aliases: string[];
  contract: QuestionContract;
  result: string;
  model: string;
  originallyAnsweredAt: string;
  createdAt: string;
  evidence: SharedEvidence[];
  stale: boolean;
  canReview: boolean;
  canRevoke: boolean;
};
export type SharedCandidate = Pick<
  SharedAnswer,
  | "id"
  | "version"
  | "answerVersion"
  | "question"
  | "contract"
  | "originallyAnsweredAt"
>;
export type SharedAnswerOrigin = {
  id: string;
  version: number;
  originallyAnsweredAt: string;
  verifiedAt: string;
  unavailable?: boolean;
  stale?: boolean;
};
