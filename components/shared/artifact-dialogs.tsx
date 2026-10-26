"use client";
import { useEffect, useRef } from "react";
import { ArtifactFields } from "@/components/artifact-fields";
import { StructureEditor } from "./artifact-structure-editor";
import { allowedLinks, definitions, statuses } from "@/lib/artifact-types";
import { referencesFor } from "@/lib/integration";
import { useProjectPage } from "./project-page-context";
import type { ArtifactActions } from "./use-artifact-actions";
export function ArtifactDialogs({
  actions,
  onReload,
}: {
  actions: ArtifactActions;
  onReload: () => void;
}) {
  const { data, artifacts } = useProjectPage();
  const { editor: editing, deleting, busy, error: formError } = actions;
  const selected = editing?.artifact ?? null,
    draft = editing?.draft ?? null,
    defaults = selected ?? draft,
    editorKind = editing?.kind;
  const dialog = useRef<HTMLDialogElement>(null),
    deleteDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (editing) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editing]);
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
  return (
    <>
      {" "}
      <dialog
        ref={dialog}
        className="matrix-dialog"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) actions.closeEditor();
        }}
      >
        {editing && editorKind && (
          <form key={selected?.id ?? "new"} onSubmit={actions.save}>
            <div className="matrix-toolbar">
              <h2>
                {selected
                  ? `${selected.code} · ${data?.canWrite ? "수정" : "상세"}`
                  : `${definitions[editorKind].label} 등록`}
              </h2>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => actions.closeEditor()}
              >
                닫기
              </button>
            </div>
            <p>
              관리번호는 자동 발급되며 변경되지 않습니다.
              {selected ? ` 현재 v${selected.version}` : ""}
            </p>
            <fieldset disabled={busy || !data?.canWrite}>
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
                <select name="status" defaultValue={defaults?.status ?? "초안"}>
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <ArtifactFields
                key={`fields:${selected?.id ?? draft?.kind ?? editorKind}`}
                kind={editorKind}
                artifact={defaults}
                isExisting={!!selected}
              />
              <StructureEditor
                key={`structure:${selected?.id ?? editorKind}`}
                kind={editorKind}
                artifact={defaults}
                artifacts={artifacts}
              />
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
              <p role="alert" className="matrix-error">
                {formError}
              </p>
            )}
            <div className="matrix-toolbar">
              {data?.canWrite && (
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? "저장 중…" : "저장"}
                </button>
              )}
              {selected && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    actions.closeEditor();
                    onReload();
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
        </p>
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
            disabled={busy}
            onClick={actions.remove}
          >
            {busy ? "처리 중…" : "삭제"}
          </button>
        </div>
      </dialog>
    </>
  );
}
