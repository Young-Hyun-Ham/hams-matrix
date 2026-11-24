"use client";
import { useConsoleGuard } from "@/components/shared/console-access";
import { useEffect, useRef, useState } from "react";
import { usePageVisible } from "@/components/shared/use-page-visible";
import { useMutation, useQuery } from "@tanstack/react-query";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import {
  approvalStageNames,
  approvalStatusNames,
  type GuardrailApproval,
} from "@/lib/ai/guardrail-approval-types";

export const approvalTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(new Date(value)) + " KST"
    : "—";
export function GuardrailApprovalDetail({
  id,
  endpoint,
  onChanged,
  onBack,
  onDirtyChange,
}: {
  id: string;
  endpoint: string;
  onChanged: () => void;
  onBack: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const visible = usePageVisible();
  const { scope, policy } = useWorkspaceQueryPolicy();
  const [comment, setComment] = useState(""),
    [confirming, setConfirming] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onDirtyChange?.(!!comment.trim());
    return () => onDirtyChange?.(false);
  }, [comment, onDirtyChange]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (comment.trim()) event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [comment]);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({
    queryKey: matrixKeys.guardrailApproval(scope, endpoint, id),
    queryFn: ({ signal }) =>
      requestJson<GuardrailApproval>(
        `${endpoint.replace("?", `/${encodeURIComponent(id)}?`)}`,
        { signal },
      ),
    ...policy,
    refetchInterval: (q) =>
      visible &&
      ["pending", "approved", "resuming"].includes(q.state.data?.status ?? "")
        ? 15000
        : false,
  });
  useEffect(() => {
    heading.current?.focus();
  }, [id]);
  const decision = useMutation({
    mutationFn: (choice: string) =>
      requestJson<GuardrailApproval>(
        endpoint.replace("?", `/${encodeURIComponent(id)}/decision?`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: choice,
            expectedVersion: query.data?.version,
            comment,
          }),
        },
      ),
    retry: false,
    onSuccess: async () => {
      setConfirming(false);
      setComment("");
      await query.refetch();
      onChanged();
    },
    onError: async () => {
      setError(
        "처리하지 못했습니다. 다른 관리자의 선처리·만료·실행 조건 변경 여부와 처리 의견을 확인해 주세요.",
      );
      await query.refetch();
      onChanged();
    },
  });
  useConsoleGuard(query.error ?? decision.error);
  const detail = query.data;
  async function decide(choice: string) {
    if (!comment.trim() || comment.trim().length > 1000) {
      setError("처리 의견을 1~1,000자로 입력해 주세요.");
      return;
    }
    setError("");
    await decision.mutateAsync(choice).catch(() => undefined);
  }
  return (
    <section
      className="guardrail-approval-detail"
      aria-labelledby="approval-detail-title"
    >
      <button type="button" className="button" onClick={onBack}>
        목록으로
      </button>
      <h2 id="approval-detail-title" ref={heading} tabIndex={-1}>
        승인 요청 상세·처리
      </h2>
      {query.isPending && <p role="status">상세를 불러오고 있습니다.</p>}
      {query.isError && (
        <p role="alert">
          상세를 조회하지 못했습니다. 권한과 요청 상태를 확인해 주세요.{" "}
          <button onClick={() => void query.refetch()}>다시 조회</button>
        </p>
      )}
      {detail && !query.isError && (
        <>
          <div className="tower-detail-summary tower-card">
            <div>
              <span className="tower-status" role="status">
                {approvalStatusNames[detail.status] ?? detail.status}
              </span>
              <h3>{detail.policies.map((p) => p.displayName).join(", ")}</h3>
              <p>
                {detail.userName} · {detail.projectName} ·{" "}
                {approvalStageNames[detail.stage]} · 정책 v
                {detail.policyVersion}
              </p>
            </div>
            <div>
              <span>요청 만료 (KST)</span>
              <strong>{approvalTime(detail.expiresAt)}</strong>
              <button
                className="button"
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(detail.id)
                    .catch(() => setError("요청 ID를 복사하지 못했습니다."))
                }
              >
                요청 ID 복사
              </button>
            </div>
          </div>
          <div className="tower-detail-grid">
            <div className="tower-detail-evidence">
              <section className="tower-card">
                <h3>사용자가 요청한 작업</h3>
                <pre>{detail.promptExcerpt || "추가 확인 필요"}</pre>
                <dl>
                  <dt>요청자</dt>
                  <dd>
                    {detail.userName} · {detail.userEmail}
                  </dd>
                  <dt>프로젝트 / 실행 대상</dt>
                  <dd>
                    {detail.projectName} / {detail.targetPage}
                  </dd>
                  <dt>요청 시각</dt>
                  <dd>{approvalTime(detail.requestedAt)}</dd>
                </dl>
                <p className="tower-note">
                  첨부 {detail.imageCount ?? 0}개 · 개인 대화 전체와 첨부 원본은
                  공개하지 않습니다.
                </p>
                <details>
                  <summary>실행 식별 정보</summary>
                  <dl>
                    <dt>요청 ID</dt>
                    <dd>{detail.id}</dd>
                    <dt>논리 실행 ID</dt>
                    <dd>{detail.logicalRequestId}</dd>
                    <dt>원 실행 요청</dt>
                    <dd>{detail.originRequestId}</dd>
                  </dl>
                </details>
              </section>
              <section className="tower-card">
                <h3>가드레일이 탐지한 내용</h3>
                <ul>
                  {detail.policies.map((p) => (
                    <li key={p.rule}>
                      {p.displayName}{" "}
                      <small>
                        ({p.rule} · {p.severity})
                      </small>
                    </li>
                  ))}
                </ul>
                <pre>{detail.inspectionExcerpt || "추가 확인 필요"}</pre>
              </section>
              <section className="tower-card">
                <h3>처리 이력</h3>
                <ol>
                  {detail.events?.map((e, i) => (
                    <li key={i}>
                      {approvalTime(e.createdAt)} ·{" "}
                      {approvalStatusNames[e.status]} · {e.actorName}
                      {e.comment && ` · ${e.comment}`}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
            <div className="tower-detail-decision">
              <section className="tower-card">
                <h3>요청 판정</h3>
                {detail.comment && (
                  <p>
                    처리 의견: {detail.comment} ({detail.decidedBy} ·{" "}
                    {approvalTime(detail.decidedAt)})
                  </p>
                )}
                {detail.status === "pending" && !detail.canDecide && (
                  <p>
                    자신의 요청은 해당 프로젝트 관리자(owner/admin)만 처리할 수
                    있습니다. 다른 관리자에게 요청해 주세요.
                  </p>
                )}
                {detail.canDecide && (
                  <div className="guardrail-decision">
                    <label htmlFor="approval-comment">처리 의견 (필수)</label>
                    <textarea
                      id="approval-comment"
                      value={comment}
                      maxLength={1000}
                      disabled={decision.isPending}
                      onChange={(e) => setComment(e.target.value)}
                      aria-describedby={
                        error ? "approval-decision-error" : undefined
                      }
                    />
                    {error && (
                      <p id="approval-decision-error" role="alert">
                        {error}
                      </p>
                    )}
                    {!confirming ? (
                      <div className="guardrail-button-row">
                        <button
                          className="button"
                          disabled={decision.isPending}
                          onClick={() => void decide("reject")}
                        >
                          반려
                        </button>
                        <button
                          className="button"
                          disabled={decision.isPending || !comment.trim()}
                          onClick={() => setConfirming(true)}
                        >
                          이 요청 승인
                        </button>
                      </div>
                    ) : (
                      <div
                        className="guardrail-confirm"
                        role="group"
                        aria-label="승인 범위 확인"
                      >
                        <p>
                          {detail.userName} · {detail.projectName} ·{" "}
                          {detail.policies.map((p) => p.displayName).join(", ")}
                        </p>
                        <p>
                          표시된 검사에 한해 예외를 승인합니다. 사용자가 ‘이어서
                          진행’을 눌러야 작업이 실행됩니다.
                        </p>
                        <button
                          className="button"
                          disabled={decision.isPending}
                          onClick={() => setConfirming(false)}
                        >
                          돌아가기
                        </button>
                        <button
                          className="button"
                          disabled={decision.isPending}
                          onClick={() => void decide("approve")}
                        >
                          {decision.isPending ? "처리 중…" : "승인 확정"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {error && !detail.canDecide && <p role="alert">{error}</p>}

                {!detail.canDecide && detail.status !== "pending" && (
                  <p>이 요청은 현재 승인·반려 처리 대상이 아닙니다.</p>
                )}
              </section>
              <section className="tower-card">
                <h3>승인하면 진행할 작업</h3>
                <p>
                  이 사용자·이 요청·정책 v{detail.policyVersion}의 표시된 검사
                  대상에 한해 예외를 적용하고 {approvalStageNames[detail.stage]}{" "}
                  검사 이후 작업을 이어갑니다.
                </p>
                <p>
                  검증된 미저장 변경안 {detail.pendingCount ?? 0}건. 이후 생성될
                  결과는 아직 생성되지 않았습니다.
                </p>
                <p className="tower-note">
                  승인 후 요청자가 ‘이어서 진행’을 눌러야 실행되며 기존 사용자
                  변경안 검토는 유지됩니다.
                </p>
              </section>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
