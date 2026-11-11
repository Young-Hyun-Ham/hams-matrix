"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useId, useRef, useState } from "react";
import type { ProjectRole } from "@/lib/plan-types";
import {
  defaultRolePermissions,
  permissionActions,
  permissionTabs,
  projectRoles,
  type RolePermissions,
} from "@/lib/project-permission-model";
import { projectTabLabels } from "@/lib/project-tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { teamRequestJson } from "@/lib/query/team-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { SetStateAction } from "react";
import "@/styles/project-tabs.css";
import { notifyProjectAccessChange } from "@/lib/project-access-events";
export function ProjectPermissionsDialog({
  projectId,
  projectName,
  onClose,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<Element | null>(null);
  const { scope, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const key = [...matrixKeys.scope(scope), "project", projectId, "permissions"];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      teamRequestJson<{ version: number; permissions: RolePermissions }>(
        `/api/projects/${projectId}/permissions`,
        { signal },
      ),
    staleTime: 0,
    retry: false,
  });
  const [editing, setEditing] = useState<{
    base: NonNullable<typeof query.data>;
    permissions: RolePermissions | null;
  } | null>(null);
  const policy = editing?.base ?? query.data;
  const draft = editing ? editing.permissions : (policy?.permissions ?? null);
  const setDraft = (action: SetStateAction<RolePermissions | null>) => {
    if (policy)
      setEditing({
        base: policy,
        permissions: typeof action === "function" ? action(draft) : action,
      });
  };
  const [role, setRole] = useState<ProjectRole>("admin");
  const [busy, setBusy] = useState(false),
    [localError, setError] = useWorkspaceErrorState("");
  const error =
    localError || resolveWorkspaceError(query.error, settings.errorMessages);
  const command = useMutation({
    mutationFn: (input: object) =>
      teamRequestJson(`/api/projects/${projectId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    retry: false,
  });
  const defaults = defaultRolePermissions();
  const dirty =
    !!draft && JSON.stringify(draft) !== JSON.stringify(policy?.permissions);
  function close() {
    if (!busy && (!dirty || window.confirm("권한 설정 변경사항을 버릴까요?")))
      onClose();
  }
  useEffect(() => {
    trigger.current = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (trigger.current instanceof HTMLElement) trigger.current.focus();
    };
  }, [projectId]);
  async function save() {
    if (!draft || !policy || busy) return;
    setBusy(true);
    setError("");
    try {
      await command.mutateAsync({
        expectedVersion: policy.version,
        permissions: draft,
      });
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "project", projectId],
      });
      notifyProjectAccessChange(projectId);
      onChanged();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="workspace-dialog admin-detail-dialog workspace-form-dialog"
      aria-labelledby="permission-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{ width: "min(900px, 95vw)" }}
    >
      <div className="dialog-header admin-detail-header">
        <h2 id="permission-dialog-title">프로젝트 역할별 권한 설정</h2>
        <button
          type="button"
          className="button admin-detail-close"
          disabled={busy}
          onClick={close}
        >
          닫기
        </button>
      </div>
      <div className="admin-detail-body project-registration-body">
        <p>
          {projectName} · 기본 허용 범위에서 권한을 조정합니다. 조회 권한과
          owner·viewer 권한은 고정입니다.
        </p>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <div className="matrix-tabs" role="tablist" aria-label="프로젝트 역할">
          {projectRoles.map((r, index) => (
            <button
              key={r}
              type="button"
              role="tab"
              id={`${id}-tab-${r}`}
              aria-controls={`${id}-panel`}
              aria-selected={role === r}
              tabIndex={role === r ? 0 : -1}
              onClick={() => setRole(r)}
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
                      ? projectRoles.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          projectRoles.length) %
                        projectRoles.length;
                setRole(projectRoles[next]);
                document
                  .getElementById(`${id}-tab-${projectRoles[next]}`)
                  ?.focus();
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${role}`}
          tabIndex={0}
        >
          {!draft ? (
            <p role="status">불러오는 중…</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>메뉴</th>
                    {permissionActions.map((a) => (
                      <th key={a}>
                        {
                          {
                            CREATE: "등록",
                            READ: "조회",
                            UPDATE: "수정",
                            DELETE: "삭제",
                          }[a]
                        }
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionTabs.map((tab) => (
                    <tr key={tab}>
                      <th>{projectTabLabels[tab]}</th>
                      {permissionActions.map((action) => {
                        const locked =
                          role === "owner" ||
                          role === "viewer" ||
                          action === "READ" ||
                          !defaults[role][tab][action];
                        return (
                          <td key={action}>
                            <input
                              type="checkbox"
                              aria-label={`${role} ${projectTabLabels[tab]} ${action}`}
                              title={
                                locked
                                  ? "고정 권한 또는 지원하지 않는 작업"
                                  : undefined
                              }
                              disabled={busy || locked}
                              checked={draft[role][tab][action]}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  [role]: {
                                    ...draft[role],
                                    [tab]: {
                                      ...draft[role][tab],
                                      [action]: e.target.checked,
                                    },
                                  },
                                })
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="project-registration-footer">
        <button
          type="button"
          className="button"
          disabled={!draft || busy}
          onClick={() => setDraft(defaultRolePermissions())}
        >
          기본값 복원
        </button>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={close}
        >
          취소
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!dirty || busy}
          onClick={save}
        >
          저장
        </button>
      </div>
    </dialog>
  );
}
