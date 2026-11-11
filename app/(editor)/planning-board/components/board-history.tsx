"use client";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import { boardFetch, boardBase } from "../lib/client-api";
type HistoryPage = {
  history?: Record<string, unknown>[];
  revisions?: Record<string, unknown>[];
  nextCursor?: string | null;
};
export function BoardHistory() {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<"review" | "revisions">("review");
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const parameters = useSearchParams();
  const query = useInfiniteQuery({
    queryKey: [
      ...matrixKeys.scope(scope),
      "planning",
      parameters.get("projectId") ?? "",
      parameters.get("screenId") ?? "",
      tab,
      "infinite",
    ],
    queryFn: ({ signal, pageParam }) =>
      requestJson<HistoryPage>(
        `${boardBase()}/${tab}${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
        { signal },
        boardFetch,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...policy,
    enabled: open,
  });
  const ids = new Set<string>();
  const items = (query.data?.pages ?? [])
    .flatMap((page) => page.history ?? page.revisions ?? [])
    .filter((item) => {
      const id = String(item.id);
      if (ids.has(id)) return false;
      ids.add(id);
      return true;
    });
  const error = resolveWorkspaceError(query.error, settings.errorMessages);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  return (
    <>
      <button className="plain-button" onClick={() => setOpen(true)}>
        변경·검토 이력
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="workspace-dialog admin-detail-dialog planning-shared-dialog"
          aria-labelledby="board-history-title"
          onCancel={() => setOpen(false)}
        >
          <div className="dialog-header admin-detail-header">
            <h2 id="board-history-title">플래닝보드 이력</h2>
            <button
              className="button admin-detail-close"
              onClick={() => setOpen(false)}
            >
              닫기
            </button>
          </div>
          <div className="admin-detail-body">
            <div className="matrix-tabs">
              <button
                aria-current={tab === "review" ? "page" : undefined}
                onClick={() => setTab("review")}
              >
                검토 이력
              </button>
              <button
                aria-current={tab === "revisions" ? "page" : undefined}
                onClick={() => setTab("revisions")}
              >
                저장 이력
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
            {query.isLoading && <p role="status">이력을 불러오는 중입니다.</p>}
            <ul>
              {items.map((item) => (
                <li key={String(item.id)}>
                  <time>
                    {new Date(String(item.createdAt)).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </time>{" "}
                  · {String(item.action ?? `본문 v${item.contentVersion}`)}{" "}
                  {String(item.toStatus ?? "")}
                  <p>{String(item.message ?? "")}</p>
                </li>
              ))}
            </ul>
            {!items.length && !error && !query.isLoading && (
              <p>이력이 없습니다.</p>
            )}
            {query.hasNextPage && (
              <button
                className="button"
                disabled={query.isFetching}
                onClick={() => void query.fetchNextPage()}
              >
                더 보기
              </button>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
