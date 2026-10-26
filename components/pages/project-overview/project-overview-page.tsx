"use client";
import "./project-overview-page.css";
import { useProjectPage } from "@/components/shared/project-page-context";
import { IntegrationOverview } from "./integration-overview";
import { kinds } from "@/lib/artifact-types";
import { projectTabLabels as labels } from "@/lib/project-tabs";
export function ProjectOverviewPage() {
  const { user, data, artifacts, selectTab: setTab } = useProjectPage();
  return (
    <>
      <IntegrationOverview artifacts={artifacts} />
      <div className="matrix-stats">
        {kinds.map((k) => (
          <button className="panel" key={k} onClick={() => setTab(k)}>
            <span>{labels[k]}</span>
            <strong>{artifacts.filter((a) => a.kind === k).length}</strong>
            <small>
              완료{" "}
              {
                artifacts.filter((a) => a.kind === k && a.status === "완료")
                  .length
              }
              건
            </small>
          </button>
        ))}
        <div className="panel">
          <span>요구사항 완료율</span>
          <strong>
            {artifacts.some((a) => a.kind === "requirement")
              ? Math.round(
                  (artifacts.filter(
                    (a) => a.kind === "requirement" && a.status === "완료",
                  ).length /
                    artifacts.filter((a) => a.kind === "requirement").length) *
                    100,
                )
              : 0}
            %
          </strong>
          <small>완료 상태 / 전체 요구사항</small>
        </div>
      </div>
      <section className="panel matrix-section">
        <h2>프로젝트 진행 순서</h2>
        <ol>
          <li>WBS에서 단계별 일정과 문서 작성 작업을 배정합니다.</li>
          <li>아키텍처의 기술·보안·성능 기준을 정의하고 승인합니다.</li>
          <li>요구사항에서 화면과 DB 설계를 연결합니다.</li>
          <li>
            프로그램의 화면·DB CRUD·아키텍처를 연결하고 개발 WBS에 배정합니다.
          </li>
          <li>현재 문서 버전으로 검증하고 통합 검수에서 누락을 확인합니다.</li>
        </ol>
        <p>
          관리번호는 자동 발급하며 수정·삭제 후에도 재사용하지 않습니다.{" "}
          {data.canWrite
            ? "등록과 수정이 가능한 계정입니다."
            : `${user.name}님은 조회 전용 계정입니다.`}
        </p>
      </section>
    </>
  );
}
