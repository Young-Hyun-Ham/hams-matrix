"use client";
import { useEffect } from "react";
import { Icon } from "@/components/icon";
import { ArtifactList } from "@/components/shared/artifact-list";
import { useProjectPage } from "@/components/shared/project-page-context";
import { jsonRequest } from "@/lib/client-request";
import "./screens-page.css";
export function ScreensPage() {
  const { data, updateData } = useProjectPage();
  useEffect(() => {
    const channel = new BroadcastChannel(`matrix-planning:${data.project.id}`);
    const controller = new AbortController();
    channel.onmessage = () => {
      void jsonRequest(`/api/projects/${data.project.id}/artifacts`, {
        signal: controller.signal,
      })
        .then((result) => updateData?.(result))
        .catch(() => {});
    };
    return () => {
      controller.abort();
      channel.close();
    };
  }, [data.project.id, updateData]);
  return (
    <ArtifactList
      kind="screen"
      readActionsLabel="플래닝보드"
      renderReadActions={(artifact) => (
        <div className="screen-planning-actions">
          <a
            className="button primary"
            aria-label={`${artifact.title} 플래닝보드 실행 (새 창)`}
            title="새 창에서 화면설계 편집기 열기"
            target="_blank"
            rel="noopener noreferrer"
            href={`/planning-board?projectId=${encodeURIComponent(data.project.id)}&screenId=${encodeURIComponent(artifact.id)}`}
          >
            <Icon name="external" size={15} />
            플래닝보드 실행
          </a>
          {artifact.planningBoardStatus === "complete" ? (
            <a
              className="button"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${artifact.title} 플래닝보드 미리보기 (새 창)`}
              title="완료된 화면설계서 미리보기"
              href={`/planning-board/preview?projectId=${encodeURIComponent(data.project.id)}&screenId=${encodeURIComponent(artifact.id)}`}
            >
              <Icon name="external" size={15} /> 미리보기
            </a>
          ) : (
            <button
              className="button"
              type="button"
              disabled
              aria-label={`${artifact.title} 플래닝보드 미리보기 (완료 후 사용 가능)`}
              title="플래닝보드에서 완료 처리한 화면설계서만 미리볼 수 있습니다."
            >
              미리보기
            </button>
          )}
        </div>
      )}
    />
  );
}
