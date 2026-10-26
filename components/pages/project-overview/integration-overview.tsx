"use client";
import type { Artifact } from "@/lib/artifact-types";
import { acceptanceReport } from "@/lib/integration";
export function IntegrationOverview({ artifacts }: { artifacts: Artifact[] }) {
  const report = acceptanceReport(artifacts);
  return (
    <section className="panel matrix-section">
      <h2>착수부터 검수까지</h2>
      <div className="matrix-flow" aria-label="통합 산출물 흐름">
        <span>WBS · 일정 / 담당 / 공수</span>
        <span>↓ 일정 통제</span>
        <span>아키텍처 · 기술 / 보안 / 성능 기준</span>
        <span>↓ 기술 기준</span>
        <span>요구사항 · 기능 / 비기능 범위</span>
        <span>↓ UI와 데이터로 구체화</span>
        <div>
          <span>화면설계서</span>
          <span> ↔ </span>
          <span>DB 설계서 · ERD</span>
        </div>
        <span>↓ 처리 로직</span>
        <span>프로그램정의서 · 컴포넌트 / API / 배치</span>
        <span>↩ 개발 WBS → 검증 / 검수</span>
      </div>
      <div className="matrix-stats">
        <div>
          <span>WBS 진척률</span>
          <strong>{report.metrics.progress}%</strong>
        </div>
        <div>
          <span>계획 / 실제 공수</span>
          <strong>
            {report.metrics.plannedEffort} / {report.metrics.actualEffort}
          </strong>
          <small>시간 · 하위 실제 작업만 집계</small>
        </div>
        <div>
          <span>검수 준비 요구사항</span>
          <strong>
            {report.passed} / {report.total}
          </strong>
        </div>
        <div>
          <span>확인할 항목</span>
          <strong>{report.issues.length}</strong>
        </div>
      </div>
    </section>
  );
}
