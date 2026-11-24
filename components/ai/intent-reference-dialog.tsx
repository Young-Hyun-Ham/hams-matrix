"use client";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { useConsoleGuard } from "@/components/shared/console-access";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import type { IntentReferenceDetail } from "@/lib/ai/intent-classification-types";

const readable = (text: string) => {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
};
export function IntentReferenceDialog({
  projectId,
  eventId,
  index,
  part,
  onClose,
}: {
  projectId: string;
  eventId: string;
  index: number;
  part: "source" | "chunk";
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const section = useRef<HTMLElement>(null);
  const { scope, policy } = useWorkspaceQueryPolicy();
  const query = useQuery({
    queryKey: [
      ...matrixKeys.intentClassifications(scope, projectId),
      "reference",
      eventId,
      index,
    ],
    queryFn: ({ signal }) =>
      requestJson<IntentReferenceDetail>(
        `/api/projects/${encodeURIComponent(projectId)}/intent-classifications/${encodeURIComponent(eventId)}/references/${index}`,
        { signal },
      ),
    ...policy,
    staleTime: 0,
    refetchInterval: false,
  });
  useConsoleGuard(query.error);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const data = !query.isFetching && !query.isError ? query.data : undefined;
  useEffect(() => {
    if (data) section.current?.focus();
  }, [data]);
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog admin-detail-dialog intent-reference-dialog"
      aria-labelledby="intent-reference-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-header admin-detail-header">
        <h2 id="intent-reference-title">검색 참조 상세</h2>
        <button type="button" className="button" onClick={onClose}>
          닫기
        </button>
      </header>
      <div className="intent-reference-body">
        {query.isFetching && (
          <p role="status">검색 참조를 불러오고 있습니다.</p>
        )}
        {query.isError && (
          <p role="alert">
            검색 참조를 확인할 수 없습니다. 권한과 이력 정보를 확인해 주세요.
          </p>
        )}
        {data && (
          <>
            <p>
              {data.reference.sourceType} · {data.reference.sourceId}
              <br />
              기록 당시 버전: {data.reference.version || "기록 없음"}
            </p>
            <section
              ref={part === "source" ? section : undefined}
              tabIndex={-1}
              aria-label="현재 원본 정보"
            >
              <h3>현재 원본 정보</h3>
              {data.source ? (
                <>
                  <p>
                    {data.source.title} · 현재 버전: {data.source.version}
                  </p>
                  {data.source.changed && (
                    <p role="status">
                      검색 당시와 현재 원본의 버전이 다릅니다.
                    </p>
                  )}
                  <a
                    className="intent-reference-link"
                    href={data.source.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    원본 작업 화면 열기 ↗
                  </a>
                  <pre>{readable(data.source.content)}</pre>
                </>
              ) : (
                <p role="status">
                  원본이 삭제되었거나 현재 열람할 수 없습니다.
                </p>
              )}
            </section>
            <section
              ref={part === "chunk" ? section : undefined}
              tabIndex={-1}
              aria-label="검색 당시 청크"
            >
              <h3>검색 당시 청크</h3>
              <p>청크 ID: {data.reference.chunkId || "기록 없음"}</p>
              {data.chunk ? (
                <>
                  <p>{data.chunk.section}</p>
                  <pre>{data.chunk.content}</pre>
                  <p>
                    검색본에 저장된 당시 내용입니다. 현재 원본과 다를 수
                    있습니다.
                  </p>
                </>
              ) : (
                <p role="status">
                  청크가 정리되었거나 현재 확인할 수 없습니다.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}
