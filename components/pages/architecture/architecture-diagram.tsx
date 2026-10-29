"use client";
import { useState } from "react";
import type { Artifact } from "@/lib/artifact-types";
import { useProjectPage } from "@/components/shared/project-page-context";
import { ArchitectureImageActions } from "./architecture-image-actions";
import { ArchitectureSummary } from "./architecture-summary";

export function ArchitectureDiagram({ artifacts }: { artifacts: Artifact[] }) {
  const { data, openEdit } = useProjectPage();
  const architectures = artifacts.filter(
    (artifact) => artifact.kind === "architecture",
  );
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const selected =
    architectures.find((artifact) => artifact.id === selectedId) ??
    architectures[0];
  return (
    <section
      className="panel matrix-section"
      aria-labelledby="architecture-diagram-heading"
    >
      <div className="matrix-toolbar">
        <h2 id="architecture-diagram-heading">아키텍처 구성도</h2>
        {selected && (
          <ArchitectureImageActions
            key={selected.id}
            artifact={selected}
            canWrite={data.canWrite}
            onBusyChange={setBusy}
          />
        )}
      </div>
      {selected ? (
        <>
          <div className="matrix-toolbar matrix-architecture-picker">
            <label htmlFor="architecture-diagram-select">아키텍처 선택</label>
            <select
              id="architecture-diagram-select"
              value={selected.id}
              disabled={busy}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {architectures.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {artifact.code} · {artifact.title}
                </option>
              ))}
            </select>
            {data.canWrite && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => openEdit(selected)}
              >
                구성요소 / 연결 편집
              </button>
            )}
          </div>
          <div className="table-scroll">
            <ArchitectureSummary artifact={selected} />
          </div>
        </>
      ) : (
        <p className="matrix-empty">
          아키텍처를 등록하면 여기에 구성도가 표시됩니다.
        </p>
      )}
    </section>
  );
}
