"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DatabaseDomain } from "@/lib/database-domain-types";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";

import {
  DATABASE_DATA_TYPES,
  databaseTypePolicy,
  isDatabaseType,
} from "@/lib/database-data-types";
export function DatabaseDomainForm({
  projectId,
  item,
  editable,
  verifyPermission,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  projectId: string;
  item: DatabaseDomain | null;
  editable: boolean;
  verifyPermission: () => Promise<boolean>;
  onClose: () => void;
  onSaved: (message: string) => void;
  onDirtyChange: (value: boolean) => void;
}) {
  const { scope } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const command = useMutation({
    mutationFn: (fields: object) =>
      requestJson<{ warnings?: string[] }>(
        `/api/projects/${encodeURIComponent(projectId)}/database/domains${item ? `/${item.id}` : ""}`,
        {
          method: item ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...fields,
            ...(item ? { version: item.version } : {}),
          }),
        },
      ),
    retry: false,
  });
  const dialog = useRef<HTMLDialogElement>(null),
    dirty = useRef(false),
    saving = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useWorkspaceErrorState("");
  const [databaseType, setDatabaseType] = useState(item?.databaseType ?? "");
  const [dataType, setDataType] = useState(item?.dataType ?? "");
  const [length, setLength] = useState(item?.length ?? "");
  const types = isDatabaseType(databaseType)
    ? DATABASE_DATA_TYPES[databaseType].types
    : {};
  const policy = databaseTypePolicy(databaseType, dataType);
  useEffect(() => {
    dialog.current?.showModal();
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  function close() {
    if (
      saving.current ||
      (dirty.current &&
        !window.confirm("저장하지 않은 변경사항을 버리시겠습니까?"))
    )
      return;
    onDirtyChange(false);
    onClose();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !editable) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await verifyPermission()))
        throw new Error("현재 작업 권한이 없습니다.");
      const result = await command.mutateAsync(fields);
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "project", projectId, "domains"],
      });
      void client.invalidateQueries({
        queryKey: matrixKeys.artifacts(scope, projectId),
      });
      dirty.current = false;
      onDirtyChange(false);
      onClose();
      onSaved(
        `도메인 메타를 저장했습니다.${result.warnings?.length ? ` ${result.warnings.join(" ")}` : ""}`,
      );
    } catch (e) {
      setError(e);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog admin-detail-dialog database-domain-dialog"
      aria-label={item ? "도메인 메타 상세" : "도메인 메타 등록"}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <form
        onSubmit={save}
        onChange={() => {
          dirty.current = true;
          onDirtyChange(true);
        }}
      >
        <div className="dialog-header admin-detail-header">
          <h2>
            {item
              ? `도메인 메타 ${editable ? "수정" : "상세"} · v${item.version}`
              : "도메인 메타 등록"}
          </h2>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            닫기
          </button>
        </div>
        <div className="admin-detail-body">
          <fieldset disabled={busy || !editable}>
            <label>
              논리 명칭 *
              <input
                name="logicalName"
                required
                maxLength={100}
                defaultValue={item?.logicalName}
                placeholder="작업"
              />
            </label>
            <label>
              물리 명칭 *
              <input
                name="physicalName"
                required
                maxLength={100}
                defaultValue={item?.physicalName}
                placeholder="job"
              />
            </label>
            {item && (!item.databaseType || !policy) && (
              <p>
                기존 자료형: {item.dataType}
                {item.length ? `(${item.length})` : ""}. DB와 지원 자료형을
                선택해 주세요.
              </p>
            )}
            <div className="matrix-field-grid">
              <label>
                DB 종류 *
                <select
                  name="databaseType"
                  required
                  value={databaseType}
                  onChange={(e) => {
                    setDatabaseType(e.target.value);
                    setDataType("");
                    setLength("");
                  }}
                >
                  <option value="">DB 선택</option>
                  {Object.entries(DATABASE_DATA_TYPES).map(([key, db]) => (
                    <option key={key} value={key}>
                      {db.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                자료형 *
                <select
                  name="dataType"
                  required
                  disabled={!databaseType}
                  value={Object.hasOwn(types, dataType) ? dataType : ""}
                  onChange={(e) => {
                    setDataType(e.target.value);
                    setLength("");
                  }}
                >
                  <option value="">자료형 선택</option>
                  {Object.keys(types).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              길이 / 정밀도
              <input
                name="length"
                maxLength={40}
                value={length}
                onChange={(e) => setLength(e.target.value)}
                readOnly={!policy || policy.parameter === "none"}
                required={policy?.required}
                placeholder="16 또는 18,2"
              />
            </label>
            <label>
              설명
              <textarea
                name="description"
                maxLength={1000}
                defaultValue={item?.description}
              />
            </label>
          </fieldset>
          <p>
            복합 명칭 전체 일치가 우선입니다. 기본 접미어 아이디는 id로
            변환합니다. 메타 수정·삭제로 기존 테이블이 자동 변경되지는 않습니다.
          </p>
          {error && (
            <p role="alert" className="matrix-error">
              {error}
            </p>
          )}
        </div>
        <div className="project-registration-footer">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            취소
          </button>
          {editable && (
            <button className="button primary" disabled={busy} type="submit">
              {busy ? "저장 중…" : "저장"}
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
