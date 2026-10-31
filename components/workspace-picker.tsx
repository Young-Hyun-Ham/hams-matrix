/* eslint-disable @next/next/no-location-assign-relative-destination -- A full reload clears all cached project and AI state when changing security scope. */
"use client";
import { useEffect, useState } from "react";
export function WorkspacePicker({ current }: { current: string }) {
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
  if (spaces.length < 2) return null;
  return (
    <div className="workspace-picker">
      <label>
        {/* 워크스페이스 */}
        <select
          value={current}
          disabled={busy}
          onChange={(event) => void change(event.target.value)}
        >
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
