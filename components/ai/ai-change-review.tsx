"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { AiChangeReview as Review } from "@/lib/ai-review-types";
import { useWorkspace } from "@/stores/workspace";
export function AiChangeReview({
  initial,
  revise,
  disabled,
}: {
  initial: Review;
  revise: (feedback: string) => void;
  disabled: boolean;
}) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy(),
    client = useQueryClient();
  const key = [...matrixKeys.scope(scope), "ai", "review", initial.reviewId];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      requestJson<{ review: Review }>(
        `/api/ai/reviews/${encodeURIComponent(initial.reviewId)}`,
        { signal },
      ),
    ...policy,
    initialData: { review: initial },
    staleTime: 0,
  });
  const review = query.data.review;
  const [feedback, setFeedback] = useState("");
  const command = useWorkspaceMutation({
    mutationFn: (decision: string) =>
      requestJson<{ review: Review }>(
        `/api/ai/reviews/${encodeURIComponent(review.reviewId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            expectedVersion: review.version,
            hash: review.hash,
          }),
        },
      ),
    retry: false,
    onSuccess: (data) => {
      client.setQueryData(key, data);
      if (data.review.status === "applied")
        useWorkspace.getState().notifyAiChange();
      useWorkspace.getState().refreshAiConversations();
      void client.invalidateQueries({
        queryKey: matrixKeys.scope(scope),
        predicate: (q) => !q.queryKey.includes(initial.reviewId),
      });
    },
    onError: () => {
      void query.refetch();
    },
  });
  const labels: Record<string, string> = {
    pending: "검토 대기 · 아직 반영되지 않음",
    applied: "승인 후 적용 완료",
    rejected: "거절됨 · 미적용",
    expired: "만료됨 · 미적용",
    invalidated: "원본 또는 정책 변경 · 새 변경안 필요",
  };
  return (
    <section className="matrix-ai-review" aria-label="AI 변경안 검토">
      <strong>{labels[review.status] ?? review.status}</strong>
      <p>
        요청 전체를 검토합니다. 만료:{" "}
        {new Date(review.expiresAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })}
      </p>
      <details>
        <summary>변경 전 내용 확인</summary>
        <pre>{JSON.stringify(review.before, null, 2)}</pre>
      </details>
      <details>
        <summary>변경 후 입력·삭제 범위·연결 전체 확인</summary>
        <pre>{JSON.stringify(review.changes, null, 2)}</pre>
      </details>
      {review.actions.length > 0 && (
        <pre>
          {review.actions
            .map(
              (a) => `${a.action} · ${a.code} · ${a.title} · 버전 ${a.version}`,
            )
            .join("\n")}
        </pre>
      )}
      {review.status === "pending" && (
        <>
          <p>아래 변경안 전체를 승인하면 실제 프로젝트 자료에 적용합니다.</p>
          <button
            type="button"
            disabled={disabled || command.isPending}
            onClick={() =>
              void command.mutateAsync("approve").catch(() => undefined)
            }
          >
            승인하고 적용
          </button>
          <button
            type="button"
            disabled={disabled || command.isPending}
            onClick={() =>
              void command.mutateAsync("reject").catch(() => undefined)
            }
          >
            거절
          </button>
          <label>
            수정할 내용
            <textarea
              maxLength={1000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={disabled || command.isPending || !feedback.trim()}
            onClick={() =>
              void command
                .mutateAsync("reject")
                .then(() => revise(feedback))
                .catch(() => undefined)
            }
          >
            수정 요청
          </button>
        </>
      )}
      {Boolean(command.error || query.error) && (
        <p role="alert">
          {resolveWorkspaceError(
            command.error || query.error,
            settings.errorMessages,
          )}
          <button type="button" onClick={() => void query.refetch()}>
            상태 다시 확인
          </button>
        </p>
      )}
    </section>
  );
}
