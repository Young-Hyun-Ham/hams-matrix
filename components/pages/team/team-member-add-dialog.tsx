"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState, type FormEvent } from "react";
import "@/styles/pages/team/team-page.css";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { teamRequestJson } from "@/lib/query/team-fetch";

export function TeamMemberAddDialog({
  projectId,
  projectName,
  onClose,
  onAdded,
}: {
  projectId: string;
  projectName?: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { scope } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const command = useMutation({
    mutationFn: (email: string) =>
      teamRequestJson("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, projectId }),
      }),
    retry: false,
  });
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useWorkspaceErrorState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function add(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await command.mutateAsync(email.trim());
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "team", "members"],
      });
      void client.invalidateQueries({ queryKey: matrixKeys.projects(scope) });
      onAdded();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog admin-detail-dialog workspace-form-dialog"
      aria-labelledby="team-add-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onClose();
      }}
    >
      <form onSubmit={(event) => void add(event)}>
        <div className="dialog-header admin-detail-header">
          <h2 id="team-add-title">멤버 추가</h2>
          <button
            type="button"
            className="button admin-detail-close"
            disabled={busy}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div className="admin-detail-body project-registration-body">
          <p>
            {projectId
              ? `${projectName ?? "선택한 프로젝트"}에`
              : "팀과 팀 프로젝트에"}{" "}
            viewer 권한으로 추가합니다.
          </p>
          <label>
            가입한 이메일
            <input
              type="email"
              autoFocus
              required
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="user@example.com"
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="project-registration-footer">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            취소
          </button>
          <button className="button primary" disabled={busy || !email.trim()}>
            {busy ? "추가 중…" : "추가"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
