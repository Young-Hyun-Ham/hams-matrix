"use client";
import "./acceptance-page.css";
import type { Artifact } from "@/lib/artifact-types";
import { definitions } from "@/lib/artifact-types";
import { acceptanceReport, referencesFor } from "@/lib/integration";
import { useProjectPage } from "@/components/shared/project-page-context";
export function AcceptancePage() {
  const { artifacts, openEdit: onOpen } = useProjectPage();
  const report = acceptanceReport(artifacts),
    codes = (list: Artifact[]) => list.map((a) => a.code).join(", ") || "—";
  return (
    <section className="panel matrix-section">
      <div className="matrix-toolbar">
        <h2>통합 검수 점검</h2>
        <strong className={report.ready ? "matrix-pass" : "matrix-pending"}>
          {report.ready
            ? "검수 준비 완료"
            : `확인 필요 ${report.issues.length}건`}
        </strong>
      </div>
      <p>
        문서 승인, 구현 완료, 개발 WBS, 기술 기준 검토, 현재 버전의 검증 결과를
        함께 점검합니다. 이 점검은 실제 발주처의 최종 검수 승인을 대신하지
        않습니다.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>요구사항</th>
              <th>아키텍처</th>
              <th>화면</th>
              <th>DB</th>
              <th>프로그램</th>
              <th>WBS</th>
              <th>검증</th>
              <th>검수 준비</th>
            </tr>
          </thead>
          <tbody>
            {report.requirements.map((r) => (
              <tr key={r.requirement.id}>
                <td>
                  <button
                    className="text-button"
                    onClick={() => onOpen(r.requirement)}
                  >
                    {r.requirement.code} · {r.requirement.title}
                  </button>
                </td>
                <td>{codes(r.architectures)}</td>
                <td>{codes(r.screens)}</td>
                <td>{codes(r.databases)}</td>
                <td>{codes(r.programs)}</td>
                <td>{codes(r.tasks)}</td>
                <td>
                  {r.validTests.length} / {r.tests.length} 통과
                </td>
                <td>{r.ready ? "준비 완료" : `${r.issues.length}건 확인`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>확인 항목</h3>
      {report.issues.map((issue, i) => (
        <div className="matrix-issue" key={`${issue.code}:${i}`}>
          <button
            className="text-button"
            disabled={!issue.artifactId}
            onClick={() => {
              const a = artifacts.find((x) => x.id === issue.artifactId);
              if (a) onOpen(a);
            }}
          >
            {issue.code}
          </button>
          <span>{issue.message}</span>
        </div>
      ))}
      {!report.issues.length && (
        <p>연결·일정·검증 점검 항목이 모두 충족되었습니다.</p>
      )}
      <details>
        <summary>전체 문서 연결 목록</summary>
        {artifacts.map((a) => (
          <p key={a.id}>
            {a.code} ({definitions[a.kind].label}) →{" "}
            {referencesFor(a)
              .map((id) => artifacts.find((x) => x.id === id)?.code ?? id)
              .join(", ") || "연결 없음"}
          </p>
        ))}
      </details>
    </section>
  );
}
