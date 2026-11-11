"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DatabaseDomain } from "@/lib/database-domain-types";
import { databaseTypeLabel } from "@/lib/database-data-types";
import type { useProjectAccess } from "@/components/shared/use-project-access";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { DatabaseDomainForm } from "./database-domain-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
type Listing = {
  items: DatabaseDomain[];
  total: number;
  page: number;
  pageSize: number;
  catalogRevision: number;
};
export function DatabaseDomainPage({
  projectId,
  access,
  reloadVersion,
  onDirtyChange,
  onChanged,
}: {
  projectId: string;
  access: ReturnType<typeof useProjectAccess>;
  reloadVersion: number;
  onDirtyChange: (dirty: boolean) => void;
  onChanged: (message: string) => void;
}) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0),
    [localError, setError] = useWorkspaceErrorState("");
  const [editor, setEditor] = useState<{ item: DatabaseDomain | null } | null>(
      null,
    ),
    [deleting, setDeleting] = useState<DatabaseDomain | null>(null),
    [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const base = `/api/projects/${encodeURIComponent(projectId)}/database/domains`;
  const queryKey = [
    ...matrixKeys.scope(scope),
    "project",
    projectId,
    "domains",
    { q, page, pageSize: 20 },
  ];
  const listing = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      requestJson<Listing>(
        `${base}?${new URLSearchParams({ q, page: String(page), pageSize: "20" })}`,
        { signal },
      ),
    ...policy,
  });
  const list = listing.data,
    loading = listing.isLoading,
    error =
      localError ||
      resolveWorkspaceError(listing.error, settings.errorMessages);
  const mutation = useMutation({
    mutationFn: ({ id, version }: DatabaseDomain) =>
      requestJson(`${base}/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      }),
    retry: false,
  });
  useEffect(() => {
    void client.invalidateQueries({
      queryKey: [...matrixKeys.scope(scope), "project", projectId, "domains"],
    });
  }, [client, scope, projectId, reloadVersion, attempt]);
  async function open(
    item: DatabaseDomain | null,
    action: "CREATE" | "UPDATE" | "DELETE" | "READ",
  ) {
    if (locked.current) return;
    locked.current = true;
    setError("");
    try {
      if (!(await access.verifyPermission("database", action)))
        throw new Error("현재 작업 권한이 없습니다.");
      const latest = item
        ? (
            await client.query({
              queryKey: [
                ...matrixKeys.scope(scope),
                "project",
                projectId,
                "domains",
                item.id,
              ],
              queryFn: ({ signal }) =>
                requestJson<{ item: DatabaseDomain }>(`${base}/${item.id}`, {
                  signal,
                }),
              staleTime: 0,
              retry: false,
            })
          ).item
        : null;
      if (action === "DELETE") setDeleting(latest);
      else setEditor({ item: latest });
    } catch (e) {
      setError(
        e instanceof RequestError
          ? e
          : e instanceof Error
            ? e.message
            : "메타를 조회하지 못했습니다.",
      );
    } finally {
      locked.current = false;
    }
  }
  async function remove() {
    if (!deleting || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await access.verifyPermission("database", "DELETE")))
        throw new Error("삭제 권한이 없습니다.");
      await mutation.mutateAsync(deleting);
      setDeleting(null);
      setAttempt((v) => v + 1);
      onChanged("도메인 메타를 삭제했습니다. 기존 테이블의 정보는 보존됩니다.");
    } catch (e) {
      setError(
        e instanceof RequestError
          ? e
          : e instanceof Error
            ? e.message
            : "삭제하지 못했습니다.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setQ(String(new FormData(e.currentTarget).get("q") ?? ""));
    setPage(1);
    setAttempt((v) => v + 1);
  }
  return (
    <section className="panel matrix-section">
      <div className="matrix-toolbar">
        <h2>
          도메인 메타{" "}
          {list ? `${list.total}건 · 사전 v${list.catalogRevision}` : ""}
        </h2>
        {access.can("database", "CREATE") && (
          <button
            className="button primary"
            onClick={() => void open(null, "CREATE")}
          >
            도메인 메타 등록
          </button>
        )}
      </div>
      <form onSubmit={search} className="matrix-toolbar">
        <input
          name="q"
          maxLength={100}
          aria-label="도메인 논리명·물리명 검색"
          placeholder="논리명 또는 물리명"
        />
        <button className="button" type="submit">
          검색
        </button>
      </form>
      {loading && <p role="status">불러오는 중…</p>}
      {error && !deleting && (
        <p role="alert" className="matrix-error">
          {error}{" "}
          <button className="button" onClick={() => setAttempt((v) => v + 1)}>
            다시 불러오기
          </button>
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>논리 명칭</th>
              <th>물리 명칭</th>
              <th>자료형</th>
              <th>DB 종류</th>
              <th>길이 / 정밀도</th>
              <th>버전</th>
              <th>최근 수정</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {list?.items.map((item) => (
              <tr key={item.id}>
                <td>{item.logicalName}</td>
                <td>{item.physicalName}</td>
                <td>{item.dataType}</td>
                <td>{databaseTypeLabel(item.databaseType)}</td>
                <td>{item.length || "—"}</td>
                <td>v{item.version}</td>
                <td>
                  {new Date(item.updatedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </td>
                <td>
                  <button
                    className="button"
                    onClick={() =>
                      void open(
                        item,
                        access.can("database", "UPDATE") ? "UPDATE" : "READ",
                      )
                    }
                  >
                    {access.can("database", "UPDATE") ? "수정" : "상세"}
                  </button>
                  {access.can("database", "DELETE") && (
                    <button
                      className="button"
                      onClick={() => void open(item, "DELETE")}
                    >
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list?.total === 0 && (
        <p>등록된 도메인 메타가 없거나 검색 결과가 없습니다.</p>
      )}
      {list && (
        <nav aria-label="도메인 메타 페이지" className="matrix-toolbar">
          <button
            className="button"
            disabled={list.page <= 1}
            onClick={() => setPage(list.page - 1)}
          >
            이전
          </button>
          <span>
            {list.page} / {Math.max(1, Math.ceil(list.total / list.pageSize))}
          </span>
          <button
            className="button"
            disabled={list.page * list.pageSize >= list.total}
            onClick={() => setPage(list.page + 1)}
          >
            다음
          </button>
        </nav>
      )}
      {editor && (
        <DatabaseDomainForm
          projectId={projectId}
          item={editor.item}
          editable={access.can("database", editor.item ? "UPDATE" : "CREATE")}
          verifyPermission={() =>
            access.verifyPermission(
              "database",
              editor.item ? "UPDATE" : "CREATE",
            )
          }
          onClose={() => {
            onDirtyChange(false);
            setEditor(null);
          }}
          onDirtyChange={onDirtyChange}
          onSaved={(message) => {
            setAttempt((v) => v + 1);
            onChanged(message);
          }}
        />
      )}
      {deleting && (
        <ConfirmationDialog
          title="도메인 메타 삭제"
          confirmLabel="삭제"
          busy={busy}
          confirmDisabled={!access.can("database", "DELETE")}
          onClose={() => setDeleting(null)}
          onConfirm={() => void remove()}
        >
          <p>
            {deleting.logicalName} ({deleting.physicalName}) 메타를
            삭제하시겠습니까? 기존 테이블은 자동 변경되지 않습니다.
          </p>
          {error && <p role="alert">{error}</p>}
        </ConfirmationDialog>
      )}
    </section>
  );
}
