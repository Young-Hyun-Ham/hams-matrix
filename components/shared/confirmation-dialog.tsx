"use client";
import { useEffect, useRef, type ReactNode } from "react";
export function ConfirmationDialog({ title, children, onConfirm, onClose, confirmLabel = "계속", busy = false, confirmDisabled = false }: { title: string; children: ReactNode; onConfirm: () => void; onClose: () => void; confirmLabel?: string; busy?: boolean; confirmDisabled?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="workspace-dialog admin-detail-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="dialog-header admin-detail-header"><h2>{title}</h2><button type="button" disabled={busy} className="button admin-detail-close" onClick={onClose}>닫기</button></div>
    <div className="admin-detail-body">{children}</div>
    <div className="project-registration-footer"><button type="button" disabled={busy} className="button" onClick={onClose}>취소</button><button type="button" disabled={busy || confirmDisabled} className="button primary" onClick={onConfirm}>{busy ? "처리 중…" : confirmLabel}</button></div>
  </dialog>;
}
