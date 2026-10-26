"use client";
import { useProjectPage } from "@/components/shared/project-page-context";
import { traceRows } from "@/lib/traceability";
export function TraceabilityPage() {
  const { artifacts } = useProjectPage();
  return (
    <section className="panel matrix-section">
      <h2>요구사항 추적표</h2>
      <p>
        기능 요구사항은 화면과 프로그램 연결을 확인하세요. 비기능 요구사항은
        화면 연결 없이 프로그램에 직접 연결할 수 있습니다.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>요구사항 ID</th>
              <th>요구사항명</th>
              <th>화면 ID</th>
              <th>DB ID</th>
              <th>프로그램 ID</th>
              <th>연결 현황</th>
            </tr>
          </thead>
          <tbody>
            {traceRows(artifacts).map((row, index) => (
              <tr key={index}>
                <td>{row.requirement?.code ?? "—"}</td>
                <td>{row.requirement?.title ?? "—"}</td>
                <td>{row.screen?.code ?? "—"}</td>
                <td>{row.database?.code ?? "—"}</td>
                <td>{row.program?.code ?? "—"}</td>
                <td>{row.relation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>연결 확인이 필요한 설계 항목</h3>
      {artifacts
        .filter((a) => a.kind !== "requirement" && !a.links.length)
        .map((a) => (
          <p key={a.id}>
            {a.code} · {a.title} — 상위 항목 미연결
          </p>
        ))}
    </section>
  );
}
