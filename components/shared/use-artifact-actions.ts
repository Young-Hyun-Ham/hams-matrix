"use client";
import { useState, type FormEvent } from "react";
import {
  definitions,
  type Artifact,
  type ArtifactKind,
} from "@/lib/artifact-types";
import { jsonRequest } from "@/lib/client-request";
import type { PermissionAction } from '@/lib/project-permission-model';
type EditorSession = {
  kind: ArtifactKind;
  artifact: Artifact | null;
  draft: Artifact | null;
};
export function useArtifactActions(
  projectId: string,
  onChanged: (message: string) => void,
  verifyPermission: (kind: ArtifactKind, action: PermissionAction) => Promise<boolean>,
) {
  const [savedArtifact, setSavedArtifact] = useState<Artifact | null>(null);
  const [editor, setEditor] = useState<EditorSession | null>(null),
    [deleting, setDeleting] = useState<Artifact | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const openCreate = (kind: ArtifactKind, draft?: Artifact) => {
    setError("");
    setEditor({ kind, artifact: null, draft: draft ?? null });
  };
  const openEdit = (artifact: Artifact) => {
    setError("");
    setEditor({ kind: artifact.kind, artifact, draft: null });
  };
  const openDelete = (artifact: Artifact) => {
    setError("");
    setDeleting(artifact);
  };
  const closeEditor = () => {
    if (!busy) setEditor(null);
  };
  const closeDelete = () => {
    if (!busy) setDeleting(null);
  };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const form = new FormData(event.currentTarget),
      fields: Record<string, string> = {},
      selected = editor.artifact,
      defaults = selected ?? editor.draft;
    for (const f of definitions[editor.kind].fields)
      fields[f.key] = String(form.get(f.key) ?? defaults?.fields[f.key] ?? "");
    setBusy(true);
    setError("");
    try {
      if (!await verifyPermission(editor.kind, selected ? 'UPDATE' : 'CREATE')) throw new Error('현재 프로젝트 권한으로 저장할 수 없습니다.');
      const result = await jsonRequest(
        `/api/projects/${projectId}/artifacts${selected ? `/${selected.id}` : ""}`,
        {
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
      );
      setSavedArtifact(result.artifact);
      setEditor(null);
      onChanged("저장했습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      if (!await verifyPermission(deleting.kind, 'DELETE')) throw new Error('현재 프로젝트 권한으로 삭제할 수 없습니다.');
      await jsonRequest(`/api/projects/${projectId}/artifacts/${deleting.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: deleting.version }),
      });
      setDeleting(null);
      onChanged(
        `${deleting.code} 항목을 삭제했습니다. 관리번호와 변경 이력은 보존됩니다.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return {
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
