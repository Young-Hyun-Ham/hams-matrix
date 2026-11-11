"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  definitions,
  type Artifact,
  type ArtifactKind,
} from "@/lib/artifact-types";
import type { PermissionAction } from "@/lib/project-permission-model";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { requestJson } from "@/lib/query/browser-fetch";
import { RequestError } from "@/lib/query/error-messages";
import { matrixKeys } from "@/lib/query/keys";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
type EditorSession = {
  sessionId: number;
  kind: ArtifactKind;
  artifact: Artifact | null;
  draft: Artifact | null;
};
export function useArtifactActions(
  projectId: string,
  onChanged: (message: string) => void,
  verifyPermission: (
    kind: ArtifactKind,
    action: PermissionAction,
  ) => Promise<boolean>,
) {
  const { scope } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ url, init }: { url: string; init: RequestInit }) =>
      requestJson<{ artifact: Artifact }>(url, init),
    retry: false,
  });
  const changed = () => {
    void client.invalidateQueries({
      queryKey: matrixKeys.artifacts(scope, projectId),
    });
    void client.invalidateQueries({ queryKey: matrixKeys.projects(scope) });
  };
  const session = useRef(0);
  useEffect(
    () => () => {
      session.current++;
    },
    [scope.userId, scope.workspaceId, projectId],
  );
  const [saveFailure, setSaveFailure] = useState(0);
  function reportSaveError(message: unknown) {
    setError(message);
    setSaveFailure((value) => value + 1);
  }
  const [savedArtifact, setSavedArtifact] = useState<Artifact | null>(null);
  const [editor, setEditor] = useState<EditorSession | null>(null),
    [deleting, setDeleting] = useState<Artifact | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useWorkspaceErrorState("");
  const openCreate = (kind: ArtifactKind, draft?: Artifact) => {
    session.current++;
    setError("");
    setEditor({
      sessionId: session.current,
      kind,
      artifact: null,
      draft: draft ?? null,
    });
  };
  const openEdit = (artifact: Artifact) => {
    session.current++;
    setError("");
    setEditor({
      sessionId: session.current,
      kind: artifact.kind,
      artifact,
      draft: null,
    });
  };
  const openDelete = (artifact: Artifact) => {
    setError("");
    setDeleting(artifact);
  };
  const closeEditor = () => {
    if (!busy) {
      session.current++;
      setEditor(null);
    }
  };
  const closeDelete = () => {
    if (!busy) setDeleting(null);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const savingSession = session.current;
    const form = new FormData(event.currentTarget),
      fields: Record<string, string> = {},
      selected = editor.artifact,
      defaults = selected ?? editor.draft;
    for (const f of definitions[editor.kind].fields)
      fields[f.key] = String(form.get(f.key) ?? defaults?.fields[f.key] ?? "");
    setBusy(true);
    setError("");
    try {
      if (
        !(await verifyPermission(editor.kind, selected ? "UPDATE" : "CREATE"))
      )
        throw new Error("현재 프로젝트 권한으로 저장할 수 없습니다.");
      const result = await mutation.mutateAsync({
        url: `/api/projects/${projectId}/artifacts${selected ? `/${selected.id}` : ""}`,
        init: {
          method: selected ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: editor.kind,
            title: form.get("title"),
            status: form.get("status"),
            fields,
            links: form.getAll("links"),
            version: selected?.version,
            structure:
              editor.kind === "wbs"
                ? {
                    parentId: form.get("parentId") ?? "",
                    dependencies: form.getAll("dependencies"),
                  }
                : editor.kind === "database"
                  ? { columns: JSON.parse(String(form.get("columns") ?? "[]")) }
                  : editor.kind === "program"
                    ? {
                        tableOperations: JSON.parse(
                          String(form.get("tableOperations") ?? "[]"),
                        ),
                      }
                    : editor.kind === "architecture"
                      ? {
                          topology: JSON.parse(
                            String(
                              form.get("topology") ?? '{"nodes":[],"edges":[]}',
                            ),
                          ),
                        }
                      : {},
            confirmReview: form.get("confirmReview") === "on",
            confirmExecution: form.get("confirmExecution") === "on",
          }),
        },
      });
      if (session.current !== savingSession) return;
      setSavedArtifact(result.artifact);
      setEditor(null);
      changed();
      onChanged("저장했습니다.");
    } catch (e) {
      if (session.current === savingSession)
        reportSaveError(
          e instanceof RequestError
            ? e
            : e instanceof Error
              ? e.message
              : "저장에 실패했습니다.",
        );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      if (!(await verifyPermission(deleting.kind, "DELETE")))
        throw new Error("현재 프로젝트 권한으로 삭제할 수 없습니다.");
      await mutation.mutateAsync({
        url: `/api/projects/${projectId}/artifacts/${deleting.id}`,
        init: {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: deleting.version }),
        },
      });
      changed();
      setDeleting(null);
      onChanged(
        `${deleting.code} 항목을 삭제했습니다. 관리번호와 변경 이력은 보존됩니다.`,
      );
    } catch (e) {
      setError(
        e instanceof RequestError
          ? e
          : e instanceof RequestError
            ? e
            : e instanceof Error
              ? e.message
              : "삭제에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    saveFailure,
    reportSaveError,
    savedArtifact,
    editor,
    deleting,
    busy,
    error,
    openCreate,
    openEdit,
    openDelete,
    closeEditor,
    closeDelete,
    save,
    remove,
  };
}
export type ArtifactActions = ReturnType<typeof useArtifactActions>;
