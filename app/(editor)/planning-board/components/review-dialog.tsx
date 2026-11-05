"use client";
import { useWorkspace } from "@/stores/workspace";

import { usePlanningAccess } from "../stores/editor-provider";
import { FormEvent, useState, useEffect, useRef } from "react";

export type ReviewDialogAction = "save" | "request" | "reject" | "complete";

type Props = {
  open: boolean;
  action: ReviewDialogAction;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: { reviewerEmail: string; message: string }) => void;
};

const labels = {
  save: {
    title: "설계서 저장",
    description: "현재 설계 내용을 저장하시겠습니까?",
    submit: "저장",
  },
  request: {
    title: "검토 요청",
    description: "검토 대상자를 선택하세요.",
    submit: "검토 요청",
  },
  reject: {
    title: "설계서 반려",
    description: "수정이 필요한 내용을 작성하면 소유자에게 전달됩니다.",
    submit: "반려",
  },
  complete: {
    title: "설계서 완료",
    description: "확인 결과 또는 완료 내용을 작성해주세요.",
    submit: "완료",
  },
} as const;

export function ReviewDialog({
  open,
  action,
  loading,
  error,
  onClose,
  onSubmit,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  const members = usePlanningAccess((state) => state.members);
  const currentUser = useWorkspace((state) => state.user);
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [message, setMessage] = useState("");

  if (!open) return null;
  const label = labels[action];
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ reviewerEmail: reviewerEmail.trim(), message: message.trim() });
  };

  return (
    <dialog
      ref={dialog}
      className="workspace-dialog admin-detail-dialog workspace-form-dialog planning-shared-dialog"
      aria-labelledby="review-dialog-title"
      aria-describedby="review-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header className="dialog-header admin-detail-header">
          <h2 id="review-dialog-title">{label.title}</h2>
          <button
            className="button admin-detail-close"
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="닫기"
          >
            닫기
          </button>
        </header>
        <div className="admin-detail-body project-registration-body">
          <p id="review-dialog-description">{label.description}</p>
          {action === "request" && (
            <label>
              <span>검토자</span>
              <select
                required
                autoFocus
                value={reviewerEmail}
                onChange={(event) => setReviewerEmail(event.target.value)}
              >
                <option value="">검토자 선택</option>
                {members
                  .filter(
                    (m) => m.id !== currentUser?.id && m.canReview !== false,
                  )
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {action !== "save" && (
            <label>
              <span>
                {action === "request" ? "요청 메시지 (선택)" : "처리 내용"}
              </span>
              <textarea
                required={action !== "request"}
                rows={5}
                maxLength={2000}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={
                  action === "reject"
                    ? "수정이 필요한 내용을 입력하세요."
                    : "검토 내용을 입력하세요."
                }
              />
            </label>
          )}
          {error && (
            <p className="review-dialog-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="project-registration-footer">
          <button
            className="button"
            type="button"
            onClick={onClose}
            disabled={loading}
          >
            취소
          </button>
          <button className="button primary" type="submit" disabled={loading}>
            {loading ? "처리 중..." : label.submit}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
