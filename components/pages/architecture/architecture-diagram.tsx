"use client";
import { useCallback, useId, useState } from "react";
import type { Artifact } from "@/lib/artifact-types";
import { useProjectPage } from "@/components/shared/project-page-context";
import { ArchitectureImageActions } from "./architecture-image-actions";
import { ArchitectureDiagramSvg } from "./architecture-diagram-svg";
import { ArchitectureMermaid } from "./architecture-mermaid";
import { topologyFor } from "@/lib/architecture";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { ArchitectureImageSurface } from "./architecture-image-surface";

export function ArchitectureDiagram({ artifacts }: { artifacts: Artifact[] }) {
  const { data, can, openEdit, savedArtifact, updateData } = useProjectPage();
  const architectures = artifacts.filter(
    (artifact) => artifact.kind === "architecture",
  );
  const prefix = useId();
  const saved =
    savedArtifact?.kind === "architecture" &&
    savedArtifact.projectId === data.project.id
      ? savedArtifact
      : null;
  const saveKey = saved ? `${saved.id}:${saved.version}` : "";
  const [selection, setSelection] = useState({ id: "", saveKey: "" });
  const selectedId = selection.saveKey === saveKey ? selection.id : saved?.id;
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mermaidDirty, setMermaidDirty] = useState(false);
  const [imageRevision, setImageRevision] = useState(0);
  const [imageAvailability, setImageAvailability] = useState<{
    artifactId: string;
    version: number;
    available: boolean;
  } | null>(null);
  const onImageAvailability = useCallback(
    (artifactId: string, version: number, available: boolean) =>
      setImageAvailability({ artifactId, version, available }),
    [],
  );
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
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
      </div>
      {selected ? (
        <>
          <div className="matrix-toolbar matrix-architecture-picker">
            <label htmlFor="architecture-diagram-select">아키텍처 선택</label>
            <select
              id="architecture-diagram-select"
              value={selected.id}
              disabled={busy}
              onChange={(event) =>
                mermaidDirty
                  ? setPendingSelection(event.target.value)
                  : setSelection({ id: event.target.value, saveKey })
              }
            >
              {architectures.map((artifact) => (
                <option key={artifact.id} value={artifact.id}>
                  {artifact.code} · {artifact.title}
                </option>
              ))}
            </select>
            {can("architecture", "UPDATE") && (
              <button
                type="button"
                className="button"
                disabled={busy || mermaidDirty}
                title={
                  mermaidDirty
                    ? "Mermaid 코드를 저장하거나 되돌린 후 편집해 주세요."
                    : undefined
                }
                onClick={() => openEdit(selected)}
              >
                구성요소 / 연결 편집
              </button>
            )}
          </div>
          <div
            className="matrix-architecture-tabs"
            role="tablist"
            aria-label="아키텍처 보기"
          >
            {["아키텍처 구성도", "Mermaid"].map((label, index) => (
              <button
                key={label}
                id={`${prefix}-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={tab === index}
                aria-controls={`${prefix}-panel-${index}`}
                tabIndex={tab === index ? 0 : -1}
                onClick={() => setTab(index)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 1
                        : 1 - index;
                  setTab(next);
                  document.getElementById(`${prefix}-tab-${next}`)?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id={`${prefix}-panel-0`}
            role="tabpanel"
            aria-labelledby={`${prefix}-tab-0`}
            hidden={tab !== 0}
            tabIndex={0}
          >
            <div className="matrix-architecture-diagram-heading">
              <h3>{selected.title}</h3>
              <ArchitectureImageActions
                key={selected.id}
                artifact={selected}
                canWrite={can("architecture", "UPDATE")}
                onBusyChange={setBusy}
                disabled={mermaidDirty}
                hasSavedImage={
                  imageAvailability?.artifactId === selected.id &&
                  imageAvailability.version === selected.version &&
                  imageAvailability.available
                }
                onGenerated={(result) => {
                  if (result.data) updateData?.(result.data);
                  setImageRevision((value) => value + 1);
                }}
              />
            </div>
            <p className="matrix-architecture-description">
              {selected.fields.definition}
            </p>
            <ArchitectureImageSurface
              key={selected.id}
              artifact={selected}
              revision={imageRevision}
              onAvailability={onImageAvailability}
            >
              {!selected.structure?.topology && (
                <p className="matrix-architecture-hint">
                  기존 기술 정보로 표시한 호환 구성도입니다. 편집 후 저장하면
                  구성요소로 확정됩니다.
                </p>
              )}
              {topologyFor(selected).nodes.length ? (
                <div className="matrix-architecture-canvas">
                  <ArchitectureDiagramSvg artifact={selected} />
                </div>
              ) : (
                <p className="matrix-empty">
                  등록된 구성요소가 없습니다. 구성요소와 연결을 추가해 주세요.
                </p>
              )}
            </ArchitectureImageSurface>
            <p className="matrix-architecture-description">
              담당자: {selected.fields.owner || "미등록"}
            </p>
            {selected.fields.notes && (
              <p className="matrix-architecture-description">
                비고: {selected.fields.notes}
              </p>
            )}
          </div>
          <div
            id={`${prefix}-panel-1`}
            role="tabpanel"
            aria-labelledby={`${prefix}-tab-1`}
            hidden={tab !== 1}
            tabIndex={0}
          >
            <ArchitectureMermaid
              key={selected.id}
              artifact={selected}
              visible={tab === 1}
              onDirtyChange={setMermaidDirty}
            />
          </div>
        </>
      ) : (
        <p className="matrix-empty">
          아키텍처를 등록하면 여기에 구성도가 표시됩니다.
        </p>
      )}
      {pendingSelection && (
        <ConfirmationDialog
          title="아키텍처 변경"
          confirmLabel="변경사항 버리고 이동"
          onClose={() => setPendingSelection(null)}
          onConfirm={() => {
            setSelection({ id: pendingSelection, saveKey });
            setPendingSelection(null);
            setMermaidDirty(false);
          }}
        >
          <p>
            편집 중인 Mermaid 코드가 저장되지 않았습니다. 변경사항을 버리고 다른
            아키텍처를 여시겠습니까?
          </p>
        </ConfirmationDialog>
      )}
    </section>
  );
}
