"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import type { DocumentListing, DocumentFile } from "@/lib/document-types";
export function DocumentFilePicker({
  projectId,
  onSelect,
}: {
  projectId: string;
  onSelect: (file: DocumentFile) => void;
}) {
  const [folders, setFolders] = useState<string[]>([]);
  const current = folders.at(-1) ?? "";
  const { scope, policy } = useWorkspaceQueryPolicy();
  const query = useQuery({
    queryKey: [
      ...matrixKeys.scope(scope),
      "project",
      projectId,
      "documents",
      { folderId: current },
    ],
    queryFn: ({ signal }) =>
      requestJson<DocumentListing>(
        "/api/projects/" +
          projectId +
          "/documents?folderId=" +
          encodeURIComponent(current),
        { signal },
      ),
    ...policy,
  });
  return (
    <fieldset>
      <legend>문서함에서 근거 선택</legend>
      <button
        className="button"
        type="button"
        disabled={!folders.length}
        onClick={() => setFolders((s) => s.slice(0, -1))}
      >
        상위 폴더
      </button>
      {query.error instanceof Error && (
        <p role="alert">{query.error.message}</p>
      )}
      {query.data?.folders.map((f) => (
        <button
          type="button"
          className="button"
          key={f.id}
          onClick={() => setFolders((s) => [...s, f.id])}
        >
          {f.name}/
        </button>
      ))}
      {query.data?.files
        .filter((f) => /\.(pdf|docx|txt|md)$/i.test(f.name))
        .map((f) => (
          <button
            type="button"
            className="button"
            key={f.id}
            onClick={() => onSelect(f)}
          >
            {f.name}
            {f.rfpSource ? " (RFP 원본)" : ""}
          </button>
        ))}
    </fieldset>
  );
}
