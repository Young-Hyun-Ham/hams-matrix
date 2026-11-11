"use client";
import { ArtifactList } from "@/components/shared/artifact-list";
import { useProjectPage } from "@/components/shared/project-page-context";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { matrixKeys } from "@/lib/query/keys";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { useDatabaseEvents } from "./use-database-events";
export function DatabasePage() {
  const { user, data } = useProjectPage();
  const projectId = data.project.id;
  const client = useQueryClient();
  const { scope } = useWorkspaceQueryPolicy();
  const refresh = useCallback(() => {
    void client.invalidateQueries({
      queryKey: matrixKeys.artifacts(scope, projectId),
    });
  }, [client, scope, projectId]);
  useDatabaseEvents(user, projectId, refresh);
  return (
    <>
      <section className="panel matrix-section">
        <h2>DB설계 도구</h2>
        <div className="matrix-toolbar">
          <a
            className="button"
            target="_blank"
            rel="noopener noreferrer"
            href={`/projects/${encodeURIComponent(projectId)}/database/erd`}
            aria-label="ERD · 테이블 관계 (새 탭)"
          >
            ERD · 테이블 관계 ↗
          </a>
          <a
            className="button"
            target="_blank"
            rel="noopener noreferrer"
            href={`/projects/${encodeURIComponent(projectId)}/database/domains`}
            aria-label="도메인 메타 관리 (새 탭)"
          >
            도메인 메타 관리 ↗
          </a>
        </div>
      </section>
      <ArtifactList kind="database" />
    </>
  );
}
