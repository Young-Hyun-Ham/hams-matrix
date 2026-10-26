"use client";
import { useProjectPage } from "@/components/shared/project-page-context";

export function DeliverablesPage() {
  const { data } = useProjectPage();
  const projectId = data.project.id;
  return (
    <section className="panel matrix-section">
      <h2>프로젝트 산출물</h2>
      <p>
        WBS·아키텍처·요구사항·화면·DB·프로그램·검수결과·추적표·연결목록·컬럼/외래키·CRUD·통합
        검수 점검을 하나의 Excel로 내려받습니다. 모든 시트에 같은 관리번호와
        버전 기준을 사용합니다.
      </p>
      <p>
        현재 제공 서식은 공공사업 공통 항목 기반입니다. 발주기관의 지정 원본과
        셀 배치까지 동일한 서식은 원본 확정 후 적용합니다.
      </p>
      <a className="button primary" href={`/api/projects/${projectId}/export`}>
        Excel 통합 문서 다운로드 (.xlsx)
      </a>
    </section>
  );
}
