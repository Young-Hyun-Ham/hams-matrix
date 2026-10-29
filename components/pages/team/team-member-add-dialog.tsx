"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import "./team-page.css";

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
  const dialog = useRef<HTMLDialogElement>(null),
    pending = useRef(false);
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
      const response = await fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), projectId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "멤버를 추가하지 못했습니다.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="team-compose-dialog"
      aria-labelledby="team-add-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending.current) onClose();
      }}
    >
      <form onSubmit={(event) => void add(event)}>
        <h2 id="team-add-title">Free 사용자 추가</h2>
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
        <div>
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
