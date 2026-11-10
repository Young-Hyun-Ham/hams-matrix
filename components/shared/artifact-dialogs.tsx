"use client";
import { WbsFormProvider } from "@/components/pages/wbs/wbs-form-state";
import { validateWbsDates } from "@/lib/wbs-date-constraints";
import { useEffect, useRef } from "react";
import { ArtifactFields } from "@/components/artifact-fields";
import { StructureEditor } from "./artifact-structure-editor";
import {
  allowedLinks,
  definitions,
  statuses,
  type Artifact,
} from "@/lib/artifact-types";
import { referencesFor } from "@/lib/integration";
import {
  useProjectPage,
  type ProjectPageContext,
} from "./project-page-context";
import { databaseDeleteReason } from "@/lib/database-relations";
import type { ArtifactActions } from "./use-artifact-actions";
export function ArtifactDialogs({
  actions,
  onReload,
}: {
  actions: ArtifactActions;
  onReload: () => void;
}) {
  const { artifacts, can, data } = useProjectPage();
  return (
    <ArtifactDialogContent
      projectId={data.project.id}
      actions={actions}
      onReload={onReload}
      artifacts={artifacts}
      can={can}
    />
  );
}
export function ArtifactDialogContent({
  projectId,
  actions,
  onReload,
  artifacts,
  can,
  onDirtyChange,
}: {
  projectId: string;
  actions: ArtifactActions;
  onReload: () => void;
  artifacts: Artifact[];
  can: ProjectPageContext["can"];
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { editor: editing, deleting, busy, error: formError } = actions;
  const dirty = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const markDirty = () => {
    dirty.current = true;
    onDirtyChange?.(true);
  };
  useEffect(() => {
    if (editing?.kind !== "wbs" || busy || !formError || !actions.saveFailure)
      return;
    const error = errorRef.current,
      body = bodyRef.current;
    if (!error || !body || !error.closest("dialog")?.open) return;
    error.focus({ preventScroll: true });
    body.scrollTop +=
      error.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
  }, [actions.saveFailure, busy, editing, formError]);
  const closeEditor = () => {
    if (
      busy ||
      (dirty.current &&
        !window.confirm("저장하지 않은 변경사항을 버리시겠습니까?"))
    )
      return false;
    dirty.current = false;
    onDirtyChange?.(false);
    actions.closeEditor();
    return true;
  };
  const selected = editing?.artifact ?? null,
    draft = editing?.draft ?? null,
    defaults = selected ?? draft,
    editorKind = editing?.kind;
  const editable =
    !!editorKind && can(editorKind, selected ? "UPDATE" : "CREATE");
  const dialog = useRef<HTMLDialogElement>(null),
    deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dirty.current = false;
    onDirtyChange?.(false);
    if (editing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing, onDirtyChange]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);
  const targets = editorKind
    ? artifacts.filter(
        (a) =>
          a.id !== selected?.id && allowedLinks[editorKind].includes(a.kind),
      )
    : [];
  const incoming = selected
    ? artifacts.filter((a) => referencesFor(a).includes(selected.id))
    : [];
  const deletionReason =
    deleting?.kind === "database"
      ? databaseDeleteReason(deleting, artifacts)
      : "";
  return (
    <>
      {" "}
      <dialog
        ref={dialog}
        className={`matrix-dialog workspace-dialog admin-detail-dialog project-registration-dialog${editorKind === "architecture" ? " project-registration-dialog-wide" : ""}`}
        onCancel={(e) => {
          e.preventDefault();
          closeEditor();
        }}
      >
        {editing && editorKind && (
          <form
            key={editing.sessionId}
            onInvalidCapture={(event) => {
              if (editorKind !== "wbs") return;
              event.preventDefault();
              const input = event.target as HTMLInputElement;
              actions.reportSaveError(
                `${input.labels?.[0]?.textContent?.trim() || input.name}: ${input.validationMessage}`,
              );
            }}
            onSubmit={(event) => {
              if (editorKind === "wbs") {
                const form = new FormData(event.currentTarget);
                const fields = Object.fromEntries(
                  definitions.wbs.fields.map((f) => [
                    f.key,
                    String(form.get(f.key) ?? ""),
                  ]),
                );
                const task = {
                  ...defaults,
                  id: selected?.id || "new-wbs",
                  kind: "wbs",
                  fields,
                  structure: {
                    parentId: String(form.get("parentId") || ""),
                    dependencies: form.getAll("dependencies").map(String),
                  },
                } as Artifact;
                const error = validateWbsDates(task, artifacts);
                if (error) {
                  event.preventDefault();
                  actions.reportSaveError(error);
                  return;
                }
              }
              void actions.save(event);
            }}
            onChange={(event) => {
              if ((event.target as HTMLElement).closest("[data-domain-search]"))
                return;
              dirty.current = true;
              onDirtyChange?.(true);
            }}
            onClickCapture={(event) => {
              if ((event.target as HTMLElement).closest("[data-domain-search]"))
                return;
              if (
                (event.target as HTMLElement).closest(
                  ".matrix-structure button",
                )
              ) {
                dirty.current = true;
                onDirtyChange?.(true);
              }
            }}
          >
            <div className="dialog-header admin-detail-header">
              <h2>
                {selected
                  ? `${selected.code} · ${editable ? "수정" : "상세"}`
                  : `${definitions[editorKind].label} 등록`}
              </h2>
              <button
                type="button"
                className="button admin-detail-close"
                disabled={busy}
                onClick={closeEditor}
              >
                닫기
              </button>
            </div>
            <div
              ref={bodyRef}
              className="admin-detail-body project-registration-body"
            >
              <p>
                관리번호는 자동 발급되며 변경되지 않습니다.
                {selected ? ` 현재 v${selected.version}` : ""}
              </p>
              <fieldset disabled={busy || !editable}>
                <label>
                  명칭 *
                  <input
                    name="title"
                    required
                    maxLength={200}
                    defaultValue={defaults?.title}
                  />
                </label>
                <label>
                  상태
                  <select
                    name="status"
                    defaultValue={defaults?.status ?? "초안"}
                  >
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                {editorKind === "wbs" ? (
                  <WbsFormProvider
                    key={selected?.id ?? "new"}
                    artifact={defaults}
                    artifacts={artifacts}
                    onModified={markDirty}
                  >
                    <ArtifactFields
                      key={`fields:${selected?.id ?? draft?.kind ?? editorKind}`}
                      kind={editorKind}
                      artifact={defaults}
                      isExisting={!!selected}
                    />
                    <StructureEditor
                      projectId={projectId}
                      disabled={busy || !editable}
                      onModified={() => {
                        dirty.current = true;
                        onDirtyChange?.(true);
                      }}
                      key={`structure:${selected?.id ?? editorKind}`}
                      kind={editorKind}
                      artifact={defaults}
                      artifacts={artifacts}
                    />
                  </WbsFormProvider>
                ) : (
                  <>
                    <ArtifactFields
                      key={`fields:${selected?.id ?? draft?.kind ?? editorKind}`}
                      kind={editorKind}
                      artifact={defaults}
                      isExisting={!!selected}
                    />
                    <StructureEditor
                      projectId={projectId}
                      disabled={busy || !editable}
                      onModified={() => {
                        dirty.current = true;
                        onDirtyChange?.(true);
                      }}
                      key={`structure:${selected?.id ?? editorKind}`}
                      kind={editorKind}
                      artifact={defaults}
                      artifacts={artifacts}
                    />
                  </>
                )}
                {allowedLinks[editorKind].length > 0 && (
                  <fieldset className="matrix-links">
                    <legend>
                      {editorKind === "wbs"
                        ? "일정에 배정할 문서 / 개발 프로그램"
                        : "연결할 기준 문서 / 설계 항목"}
                    </legend>
                    {!targets.length && (
                      <p>
                        연결할 항목이 없습니다. 상위 항목을 먼저 등록해 주세요.
                      </p>
                    )}
                    {targets.map((a) => (
                      <label key={a.id}>
                        <input
                          type="checkbox"
                          name="links"
                          value={a.id}
                          defaultChecked={defaults?.links.includes(a.id)}
                        />{" "}
                        {a.code} · {a.title}
                      </label>
                    ))}
                  </fieldset>
                )}
              </fieldset>
              {incoming.length > 0 && (
                <p>
                  이 항목을 참조하는 항목:{" "}
                  {incoming.map((a) => a.code).join(", ")}
                </p>
              )}
              {formError && (
                <p
                  ref={errorRef}
                  id="wbs-save-error"
                  tabIndex={editorKind === "wbs" ? -1 : undefined}
                  role="alert"
                  className="matrix-error"
                >
                  {formError}
                </p>
              )}
            </div>
            <div className="matrix-toolbar project-registration-footer">
              {editable && (
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy
                    ? editorKind === "architecture"
                      ? "구성도 생성 및 저장 중…"
                      : "저장 중…"
                    : "저장"}
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    if (closeEditor()) onReload();
                  }}
                >
                  최신 내용 다시 불러오기
                </button>
              )}
            </div>
          </form>
        )}
      </dialog>
      <dialog
        ref={deleteDialog}
        className="matrix-dialog"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) actions.closeDelete();
        }}
      >
        <h2>항목 삭제</h2>
        <p>
          {deleting?.code} · {deleting?.title} 항목을 삭제하시겠습니까?
          {deleting?.kind === "database" &&
            ` (${deleting.fields.physicalName} / ${deleting.fields.logicalName})`}
        </p>
        {deletionReason && <p role="alert">{deletionReason}</p>}
        <p>
          연결이 남아 있으면 삭제할 수 없습니다. 삭제 후에도 관리번호와 이력은
          보존됩니다.
        </p>
        {formError && (
          <p role="alert" className="matrix-error">
            {formError}
          </p>
        )}
        <div className="matrix-toolbar">
          <button
            className="button"
            disabled={busy}
            onClick={() => actions.closeDelete()}
          >
            취소
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              !deleting ||
              !!deletionReason ||
              !can(deleting.kind, "DELETE")
            }
            onClick={actions.remove}
          >
            {busy ? "처리 중…" : "삭제"}
          </button>
        </div>
      </dialog>
    </>
  );
}
