"use client";
import { useWorkspaceMutation } from "@/components/query/use-workspace-mutation";
import { DocumentFilePicker } from "./document-file-picker";
import { useState } from "react";
import type { SourceReference } from "@/lib/artifact-types";
import { requestJson } from "@/lib/query/browser-fetch";
export function SourceReferenceEditor({
  projectId,
  initial,
  onModified,
}: {
  projectId: string;
  initial: SourceReference[];
  onModified: () => void;
}) {
  const [rows, setRows] = useState(initial),
    [file, setFile] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const command = useWorkspaceMutation({
    mutationFn: (input: object) =>
      requestJson<{ snapshot: { id: string; name: string } }>(
        "/api/projects/" + projectId + "/source-snapshots",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    retry: false,
  });
  async function add(type: "rfp" | "file") {
    setBusy(true);
    setError("");
    try {
      const r = await command.mutateAsync({ type, id: file });
      onModified();
      setRows((s) => [
        ...s,
        {
          snapshotId: r.snapshot.id,
          locator: r.snapshot.name,
          excerpt: "",
          rationale: "사용자 지정 근거",
          origin: "사용자 지정",
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "출처 연결 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset>
      <legend>출처·근거</legend>
      <input type="hidden" name="sources" value={JSON.stringify(rows)} />
      {rows.map((r, i) => (
        <div key={i}>
          <label>
            근거 위치 / 장 / 항목
            <input
              maxLength={3000}
              value={r.locator}
              onChange={(e) =>
                setRows((s) =>
                  s.map((x, j) =>
                    j === i ? { ...x, locator: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            원문 발췌
            <textarea
              maxLength={3000}
              value={r.excerpt}
              onChange={(e) =>
                setRows((s) =>
                  s.map((x, j) =>
                    j === i ? { ...x, excerpt: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            근거 구분
            <select
              value={r.origin}
              onChange={(e) =>
                setRows((s) =>
                  s.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          origin: e.target.value as SourceReference["origin"],
                        }
                      : x,
                  ),
                )
              }
            >
              {["원문 명시", "설계 도출", "사용자 지정"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <input
            aria-label="근거 설명"
            value={r.rationale}
            onChange={(e) =>
              setRows((s) =>
                s.map((x, j) =>
                  j === i ? { ...x, rationale: e.target.value } : x,
                ),
              )
            }
          />
          <button
            type="button"
            className="button"
            onClick={() => {
              onModified();
              setRows((s) => s.filter((_, j) => j !== i));
            }}
          >
            연결 해제
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => void add("rfp")}
      >
        저장된 RFP 연결
      </button>
      <DocumentFilePicker
        projectId={projectId}
        onSelect={(f) => setFile(f.id)}
      />
      <button
        type="button"
        className="button"
        disabled={busy || !file}
        onClick={() => void add("file")}
      >
        첨부 근거 연결
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
