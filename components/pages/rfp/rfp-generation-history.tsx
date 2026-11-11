"use client";
import { useEffect, useRef } from "react";
import type { RfpGenerationHistory } from "@/lib/rfp-source-types";

import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
const labels = {
  running: "생성 중",
  stop_requested: "중지 요청 중",
  finalizing: "저장 중",
  completed: "완료",
  cancelled: "취소",
  failed: "실패",
};
export function RfpGenerationHistoryDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const queryKey = [
    ...matrixKeys.scope(scope),
    "project",
    projectId,
    "rfp",
    "history",
    "infinite",
  ];
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ signal, pageParam }) =>
      requestJson<RfpGenerationHistory>(
        `/api/projects/${projectId}/rfp/generate${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...policy,
  });
  const ids = new Set<string>();
  const history: RfpGenerationHistory = {
    items: (query.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => {
        if (ids.has(item.requestId)) return false;
        ids.add(item.requestId);
        return true;
      }),
    nextCursor: query.hasNextPage
      ? (query.data?.pages.at(-1)?.nextCursor ?? null)
      : null,
  };
  const loading = query.isFetching,
    error = resolveWorkspaceError(query.error, settings.errorMessages);
  async function load(cursor: string | null = null) {
    if (cursor) await query.fetchNextPage();
    else {
      client.setQueryData<InfiniteData<RfpGenerationHistory, string | null>>(
        queryKey,
        (current) =>
          current
            ? {
                pages: current.pages.slice(0, 1),
                pageParams: current.pageParams.slice(0, 1),
              }
            : current,
      );
      await query.refetch();
    }
  }
  useEffect(() => {
    const trigger = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
    // This dialog is mounted separately for each project/open action.
  }, []);
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog admin-detail-dialog rfp-history-dialog"
      aria-labelledby="rfp-history-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-header admin-detail-header">
        <h2 id="rfp-history-title">AI 제안요청서 생성 이력</h2>
        <button
          type="button"
          className="button admin-detail-close"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      <div className="admin-detail-body rfp-history-body">
        <p className="rfp-source-help">
          이 프로젝트에서 내가 요청한 생성 이력입니다.
        </p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {loading && <p role="status">생성 이력을 불러오는 중입니다.</p>}
        {!loading && !error && !history.items.length && (
          <p>생성 이력이 없습니다.</p>
        )}
        {history.items.map((item) => (
          <article className="rfp-history-item" key={item.requestId}>
            <div className="rfp-history-heading">
              <strong>{item.sourceName}</strong>
              <span data-status={item.status}>{labels[item.status]}</span>
            </div>
            <dl>
              <dt>요청 일시</dt>
              <dd>
                {new Date(item.createdAt).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                })}
              </dd>
              <dt>모델</dt>
              <dd>{item.model}</dd>
              <dt>요청 범위</dt>
              <dd className="rfp-history-prompt">
                {item.prompt || "원본 전체"}
              </dd>
              {item.status === "completed" && item.documentVersion !== null && (
                <>
                  <dt>저장 버전</dt>
                  <dd>v{item.documentVersion}</dd>
                </>
              )}
              {item.finishedAt && (
                <>
                  <dt>종료 일시</dt>
                  <dd>
                    {new Date(item.finishedAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </dd>
                </>
              )}
              {item.errorCode !== null && (
                <>
                  <dt>오류 코드</dt>
                  <dd>{item.errorCode}</dd>
                </>
              )}
              <dt>요청 ID</dt>
              <dd>{item.requestId}</dd>
            </dl>
          </article>
        ))}
        {history.nextCursor && (
          <button
            type="button"
            className="button"
            disabled={loading}
            onClick={() => void load(history.nextCursor)}
          >
            더 보기
          </button>
        )}
      </div>
      <div className="project-registration-footer">
        <button
          type="button"
          className="button"
          disabled={loading}
          onClick={() => void load()}
        >
          새로고침
        </button>
        <button type="button" className="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </dialog>
  );
}
