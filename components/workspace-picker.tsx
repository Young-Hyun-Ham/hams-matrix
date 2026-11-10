/* eslint-disable @next/next/no-location-assign-relative-destination -- A full reload clears all cached project and AI state when changing security scope. */
"use client";
import { useEffect, useRef, useState } from "react";
export function WorkspacePicker({ current }: { current: string }) {
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [name, setName] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me/workspace", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.ok) setSpaces((await response.json()).workspaces);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [current]);
  async function change(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign("/dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "전환 실패");
      setBusy(false);
    }
  }
  async function create() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "워크스페이스를 만들지 못했습니다.");
      window.location.assign("/dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "생성 실패");
      setBusy(false);
    } finally {
      submitting.current = false;
    }
  }
  return (
    <div className="workspace-picker">
      <label>
        {/* 워크스페이스 */}
        <select
          aria-label="워크스페이스 선택"
          value={current}
          disabled={busy}
          onChange={(event) => {
            if (event.target.value === "") {
              setError("");
              dialog.current?.showModal();
            } else void change(event.target.value);
          }}
        >
          <option value="">+ 새 워크스페이스</option>
          {!spaces.some((space) => space.id === current) && (
            <option value={current}>현재 워크스페이스</option>
          )}
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      {error && <small role="alert">{error}</small>}
      <dialog
        ref={dialog}
        className="workspace-dialog"
        aria-labelledby="workspace-create-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form
          style={{ padding: 24 }}
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <h2 id="workspace-create-title">워크스페이스 만들기</h2>
          <p>
            현재 계정 요금제로 생성되며, 이후 요금제를 변경해도 이
            워크스페이스의 플랜은 유지됩니다.
          </p>
          <label>
            이름{" "}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              required
              disabled={busy}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 20,
            }}
          >
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              취소
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={busy || !name.trim()}
            >
              {busy ? "생성 중…" : "만들기"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
