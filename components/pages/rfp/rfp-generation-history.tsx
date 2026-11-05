"use client";
import { useEffect, useRef, useState } from "react";
import type { RfpGenerationHistory } from "@/lib/rfp-source-types";

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
  const dialog = useRef<HTMLDialogElement>(null),
    controller = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<RfpGenerationHistory>({
    items: [],
    nextCursor: null,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load(cursor: string | null = null) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/rfp/generate${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store", signal: request.signal },
      );
      if (!response.ok)
        throw new Error(
          "생성 이력을 불러오지 못했습니다. 조회 권한과 연결 상태를 확인해 주세요.",
        );
      const result: RfpGenerationHistory = await response.json();
      if (!request.signal.aborted)
        setHistory((previous) => ({
          items: cursor ? [...previous.items, ...result.items] : result.items,
          nextCursor: result.nextCursor,
        }));
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : "이력 조회에 실패했습니다.",
        );
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const trigger = document.activeElement;
    dialog.current?.showModal();
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      controller.current?.abort();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
    // This dialog is mounted separately for each project/open action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <dd>{new Date(item.createdAt).toLocaleString("ko-KR")}</dd>
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
                  <dd>{new Date(item.finishedAt).toLocaleString("ko-KR")}</dd>
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
