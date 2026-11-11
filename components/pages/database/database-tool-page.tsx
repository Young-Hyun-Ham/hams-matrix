"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useCallback, useRef, useState, useEffect } from "react";
import type { User } from "@/lib/types";
import type { Artifact, ProjectData } from "@/lib/artifact-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { RequestError } from "@/lib/query/error-messages";
import { useProjectAccess } from "@/components/shared/use-project-access";
import { useArtifactActions } from "@/components/shared/use-artifact-actions";
import { ArtifactDialogContent } from "@/components/shared/artifact-dialogs";
import { DatabaseDiagram } from "./database-diagram";
import { DatabaseDomainPage } from "./database-domain-page";
import { databaseDeleteReason } from "@/lib/database-relations";
import { notifyDatabaseChange, useDatabaseEvents } from "./use-database-events";
import { ThemeToggle } from "@/components/theme-toggle";
export function DatabaseToolPage({
  user,
  initialData,
  mode,
  initialLoadedAt,
}: {
  user: User;
  initialData: ProjectData;
  mode: "erd" | "domains";
  initialLoadedAt: string;
}) {
  const { scope, policy } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const client = useQueryClient();
  useQuery({
    queryKey: matrixKeys.artifacts(scope, initialData.project.id),
    queryFn: ({ signal }) =>
      requestJson<ProjectData>(
        `/api/projects/${initialData.project.id}/artifacts`,
        { signal },
      ),
    ...policy,
    initialData,
  });
  const [data, setData] = useState(initialData),
    [notice, setNotice] = useState(""),
    [error, setError] = useWorkspaceErrorState(""),
    [loading, setLoading] = useState(false),
    [reloadVersion, setReloadVersion] = useState(0),
    [loadedAt, setLoadedAt] = useState(initialLoadedAt);
  const dirty = useRef(false),
    mounted = useRef(true),
    sequence = useRef(0),
    opening = useRef(false);
  const projectId = initialData.project.id;
  const access = useProjectAccess(user, projectId, "database");
  const invalidate = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidate();
    };
  }, [invalidate]);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const refresh = useCallback(async () => {
    if (dirty.current) {
      setNotice(
        "다른 변경이 있을 수 있습니다. 편집 내용을 보존했습니다. 저장 또는 취소 후 최신 내용을 조회해 주세요.",
      );
      return null;
    }
    const current = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const next = await client.query({
        queryKey: matrixKeys.artifacts(
          { userId: user.id, workspaceId: user.workspaceId },
          projectId,
        ),
        queryFn: ({ signal }) =>
          requestJson<ProjectData>(
            `/api/projects/${encodeURIComponent(projectId)}/artifacts`,
            { signal },
          ),
        staleTime: 0,
        retry: false,
      });
      if (!mounted.current || current !== sequence.current) return null;
      if (!next.permissionsByTab.database.READ)
        throw new Error("DB설계 조회 권한이 없습니다.");
      setData(next);
      setLoadedAt(
        new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      );
      setReloadVersion((v) => v + 1);
      return next;
    } catch (e) {
      if (mounted.current && current === sequence.current)
        setError(
          e instanceof RequestError
            ? e
            : e instanceof Error
              ? e.message
              : "갱신하지 못했습니다.",
        );
      return null;
    } finally {
      if (mounted.current && current === sequence.current) setLoading(false);
    }
  }, [client, projectId, user.id, user.workspaceId, setError]);
  const externalRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);
  useDatabaseEvents(user, projectId, externalRefresh);
  const changed = useCallback(
    (message: string) => {
      dirty.current = false;
      setNotice(message);
      notifyDatabaseChange(user, projectId);
      void refresh();
    },
    [user, projectId, refresh],
  );
  const actions = useArtifactActions(
    projectId,
    changed,
    access.verifyPermission,
  );
  async function open(table: Artifact, action: "UPDATE" | "DELETE") {
    if (opening.current) return;
    opening.current = true;
    try {
      if (!(await access.verifyPermission("database", action))) {
        setError("현재 작업 권한이 없습니다.");
        return;
      }
      const latest = await refresh();
      const target = latest?.artifacts.find(
        (a) => a.id === table.id && a.kind === "database",
      );
      if (!latest) return;
      if (!target) {
        setError("테이블이 삭제되었습니다. 최신 ERD를 확인해 주세요.");
        return;
      }
      if (action === "DELETE") {
        const reason = databaseDeleteReason(target, latest.artifacts);
        if (reason) {
          setError(reason);
          return;
        }
        actions.openDelete(target);
      } else actions.openEdit(target);
    } finally {
      opening.current = false;
    }
  }
  return (
    <main className="database-tools">
      <header className="database-tool-header">
        <div>
          <p>{data.project.name}</p>
          <h1>{mode === "erd" ? "ERD · 테이블 관계" : "도메인 메타 관리"}</h1>
        </div>
        <nav aria-label="DB설계 도구">
          <a
            className="button"
            href={`/projects/${encodeURIComponent(projectId)}/database/${mode === "erd" ? "domains" : "erd"}`}
          >
            {mode === "erd" ? "도메인 메타 관리" : "ERD 보기"}
          </a>
          <button
            className="button"
            disabled={loading}
            onClick={externalRefresh}
          >
            새로고침
          </button>
          <ThemeToggle />
          <button
            type="button"
            className="button"
            aria-label="관리 화면 닫기"
            onClick={() => window.close()}
          >
            닫기
          </button>
        </nav>
      </header>
      {notice && <p role="status">{notice}</p>}
      {loadedAt && <p>최종 조회: {loadedAt}</p>}
      {loading && <p role="status">최신 자료를 조회하는 중…</p>}
      {(error || access.error) && (
        <p className="matrix-error" role="alert">
          {error || access.error}{" "}
          <button className="button" onClick={externalRefresh}>
            갱신 다시 시도
          </button>
        </p>
      )}
      {mode === "erd" ? (
        <>
          <DatabaseDiagram
            projectId={projectId}
            artifacts={data.artifacts}
            canUpdate={access.can("database", "UPDATE")}
            canDelete={access.can("database", "DELETE")}
            onEdit={(t) => void open(t, "UPDATE")}
            onDelete={(t) => void open(t, "DELETE")}
          />
          <ArtifactDialogContent
            projectId={projectId}
            actions={actions}
            artifacts={data.artifacts}
            can={access.can}
            onReload={externalRefresh}
            onDirtyChange={onDirtyChange}
          />
        </>
      ) : (
        <DatabaseDomainPage
          projectId={projectId}
          access={access}
          reloadVersion={reloadVersion}
          onDirtyChange={onDirtyChange}
          onChanged={changed}
        />
      )}
    </main>
  );
}
