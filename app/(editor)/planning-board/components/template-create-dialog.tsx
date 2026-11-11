import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";
import { RequestError } from "@/lib/query/error-messages";
import { useEffect, useRef, useState } from "react";
export function TemplateCreateDialog({
  title,
  onCreate,
  onClose,
}: {
  title: string;
  onCreate: (name: string, requestId: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(title);
  const [busy, setBusy] = useState(false),
    [error, setError] = useWorkspaceErrorState("");
  const attempt = useRef<{ name: string; id: string } | null>(null);
  useEffect(() => {
    const node = dialog.current;
    if (node && !node.open) node.showModal();
    // Removing the dialog from the DOM dismisses it. Calling close() during
    // Strict Mode effect replay emits a close event and dismisses the new modal.
  }, []);
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog admin-detail-dialog workspace-form-dialog planning-shared-dialog template-create-dialog"
      aria-labelledby="template-create-title"
      aria-describedby="template-create-description"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          if (attempt.current?.name !== name)
            attempt.current = { name, id: crypto.randomUUID() };
          try {
            await onCreate(name, attempt.current.id);
            onClose();
          } catch (error) {
            setError(
              error instanceof RequestError
                ? error
                : error instanceof Error
                  ? error.message
                  : "템플릿 생성 실패",
            );
            setBusy(false);
          }
        }}
      >
        <div className="dialog-header admin-detail-header">
          <h2 id="template-create-title">프로젝트 템플릿 생성</h2>
          <button
            className="button admin-detail-close"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div className="admin-detail-body project-registration-body">
          <p id="template-create-description">
            현재 편집 중인 보드 전체를 이 프로젝트에서 사용할 템플릿으로
            저장합니다.
          </p>
          <label>
            템플릿 이름
            <input
              autoFocus
              aria-label="템플릿 이름"
              required
              maxLength={80}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="template-error">
              {error}
            </p>
          )}
        </div>
        <div className="project-registration-footer">
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            취소
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={busy || !name.trim()}
          >
            {busy ? "생성 중..." : "생성"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
