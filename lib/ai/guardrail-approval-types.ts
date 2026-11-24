import type { GuardrailFinding } from "./guardrail-types";
export type GuardrailApproval = {
  id: string;
  turnId?: string;
  turnSeq?: number;
  sequence?: number;
  status: string;
  version: number;
  originRequestId: string;
  logicalRequestId: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  convId: string;
  userId: string;
  userName: string;
  userEmail: string;
  policyVersion: number;
  stage: string;
  policies: (GuardrailFinding & { displayName: string })[];
  targetPage: string;
  createdAt: string;
  requestedAt: string | null;
  expiresAt: string;
  decidedAt: string | null;
  decidedBy: string;
  comment: string;
  attemptRequestId: string;
  canResume: boolean;
  canCancel: boolean;
  canDecide: boolean;
  promptExcerpt?: string;
  inspectionExcerpt?: string;
  pendingCount?: number;
  imageCount?: number;
  events?: {
    status: string;
    actorName: string;
    comment: string;
    createdAt: string;
  }[];
};
export const approvalStatusNames: Record<string, string> = {
  awaiting_choice: "승인 요청 여부 선택",
  declined: "승인 요청하지 않음",
  pending: "관리자 승인 대기",
  approved: "승인됨 · 사용자 재개 대기",
  resuming: "재개 실행 중",
  rejected: "반려",
  cancelled: "취소",
  expired: "만료",
  invalidated: "실행 조건 변경",
  completed: "실행 완료",
  reblocked: "다시 가드레일 탐지",
  failed: "실행 실패",
};
export const approvalStageNames: Record<string, string> = {
  input: "입력",
  context: "참고 자료",
  tool: "도구 요청",
  "tool-result": "도구 결과",
  output: "출력",
};
