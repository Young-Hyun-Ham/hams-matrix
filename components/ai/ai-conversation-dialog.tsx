"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AiConversation } from "@/lib/ai-context";
import { useWorkspace } from "@/stores/workspace";

export function AiConversationDialog({
  room,
  kind,
  onClose,
  onUpdate,
  onRemove,
}: {
  room: AiConversation;
  kind: "rename" | "delete";
  onClose: () => void;
  onUpdate: (room: AiConversation) => void;
  onRemove: (convId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    busy = useRef(false),
    active = useRef(true);
  const [title, setTitle] = useState(room.title),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    active.current = true;
    dialog.current?.showModal();
    return () => {
      active.current = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ai/conversations/${encodeURIComponent(room.convId)}`,
        {
          method: kind === "rename" ? "PATCH" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: room.projectId,
            ...(kind === "rename" ? { title } : {}),
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (kind === "delete") {
        useWorkspace.getState().removeAiConversation(room.convId);
        if (active.current) onRemove(room.convId);
      } else {
        useWorkspace.getState().updateAiConversation(data.conversation);
        if (active.current) onUpdate(data.conversation);
      }
      if (active.current) onClose();
    } catch (error) {
      if (active.current)
        setError(
          error instanceof Error ? error.message : "변경하지 못했습니다.",
        );
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog admin-detail-dialog workspace-form-dialog matrix-ai-room-dialog"
      aria-labelledby="matrix-ai-room-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy.current) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy.current) onClose();
      }}
    >
      <div className="dialog-header admin-detail-header">
        <h2 id="matrix-ai-room-dialog-title">
          {kind === "rename" ? "채팅방 제목 변경" : "채팅방 삭제"}
        </h2>
        <button
          type="button"
          className="button admin-detail-close"
          aria-label="채팅방 설정 닫기"
          disabled={pending}
          onClick={onClose}
        >
          닫기
        </button>
      </div>
      <form onSubmit={submit}>
        <div className="admin-detail-body project-registration-body">
        {kind === "rename" ? (
          <label>
            채팅방 제목
            <input
              autoFocus
              aria-label="채팅방 제목 입력"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              required
              disabled={pending}
            />
          </label>
        ) : (
          <div>
            <p>
              <strong>{room.title}</strong> 채팅방을 삭제하시겠습니까?
            </p>
            <p>대화와 첨부 이미지가 함께 삭제되며 복구할 수 없습니다.</p>
          </div>
        )}
        {error && (
          <p role="alert" className="matrix-ai-error">
            {error}
          </p>
        )}
        </div>
        <div className="matrix-ai-room-dialog-actions project-registration-footer">
          <button
            autoFocus={kind === "delete"}
            type="button"
            className="button"
            disabled={pending}
            onClick={onClose}
          >
            취소
          </button>
          <button
            type="submit"
            className={`button ${kind === "delete" ? "matrix-ai-delete-confirm" : "primary"}`}
            disabled={pending || (kind === "rename" && !title.trim())}
          >
            {pending ? "처리 중…" : kind === "rename" ? "저장" : "삭제"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
