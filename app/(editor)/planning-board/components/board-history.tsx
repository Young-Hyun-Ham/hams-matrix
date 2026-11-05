"use client";
import { useEffect, useRef, useState } from "react";
import { boardFetch, boardBase } from "../lib/client-api";
export function BoardHistory() {
  const [open, setOpen] = useState(false),
    [tab, setTab] = useState<"review" | "revisions">("review"),
    [items, setItems] = useState<Record<string, unknown>[]>([]),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  async function load(more = false) {
    try {
      const response = await boardFetch(
        `${boardBase()}/${tab}${more && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setItems((old) =>
        more
          ? [...old, ...(result.history ?? result.revisions ?? [])]
          : (result.history ?? result.revisions ?? []),
      );
      setCursor(result.nextCursor ?? null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이력을 불러오지 못했습니다.");
    }
  }
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      void Promise.resolve().then(() => load());
    }
    // Loading is keyed by the selected history tab; pagination is an explicit action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);
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
            {!items.length && !error && <p>이력이 없습니다.</p>}
            {cursor && (
              <button className="button" onClick={() => void load(true)}>
                더 보기
              </button>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
