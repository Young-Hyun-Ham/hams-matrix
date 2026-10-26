"use client";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/icon";
export type PreviewDetail = {
  title: string;
  body: string;
  before?: string;
  after?: string;
};
export function PreviewDialog({
  detail,
  onClose,
  badge = "기능 및 화면 미리보기",
}: {
  detail: PreviewDetail | null;
  onClose: () => void;
  badge?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (detail) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [detail]);
  return (
    <dialog
      ref={dialogRef}
      className="workspace-dialog"
      onCancel={() => onClose()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-header">
        <h2>{detail?.title}</h2>
        <button
          className="icon-button"
          aria-label="닫기"
          onClick={() => onClose()}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="detail-content">
        <span className="badge purple">{badge}</span>
        <p>{detail?.body}</p>
        {detail?.before && (
          <div className="detail-diff">
            <div>
              <strong>변경 전</strong>
              <pre>{detail.before}</pre>
            </div>
            <div>
              <strong>변경 후</strong>
              <pre>{detail.after}</pre>
            </div>
          </div>
        )}
        <button className="button primary" onClick={() => onClose()}>
          확인
        </button>
      </div>
    </dialog>
  );
}
