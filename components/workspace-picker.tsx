/* eslint-disable @next/next/no-location-assign-relative-destination -- A full reload clears all cached project and AI state when changing security scope. */
"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaces } from "@/components/query/use-workspaces";
import { requestJson } from "@/lib/query/browser-fetch";

import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
export function WorkspacePicker({ current }: { current: string }) {
  const query = useWorkspaces();
  const spaces = query.data?.workspaces ?? [];
  const client = useQueryClient();
  const { scope } = useWorkspaceQueryPolicy();
  const mutation = useMutation({
    mutationFn: ({ method, data }: { method: string; data: object }) =>
      requestJson("/api/me/workspace", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    retry: false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useWorkspaceErrorState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [name, setName] = useState("");
  async function change(id: string) {
    setBusy(true);
    setError("");
    try {
      await client.cancelQueries({ queryKey: matrixKeys.scope(scope) });
      await mutation.mutateAsync({
        method: "PATCH",
        data: { workspaceId: id },
      });
      client.removeQueries({ queryKey: matrixKeys.scope(scope) });
      window.location.assign("/dashboard");
    } catch (error) {
      setError(error);
      setBusy(false);
    }
  }
  async function create() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await client.cancelQueries({ queryKey: matrixKeys.scope(scope) });
      await mutation.mutateAsync({ method: "POST", data: { name } });
      client.removeQueries({ queryKey: matrixKeys.scope(scope) });
      window.location.assign("/dashboard");
    } catch (error) {
      setError(error);
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
