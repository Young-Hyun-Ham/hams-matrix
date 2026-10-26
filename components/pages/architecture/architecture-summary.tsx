import type { Artifact } from "@/lib/artifact-types";

const technologyBlocks = [
  { key: "languages", label: "개발 언어", symbol: "</>" },
  { key: "frameworks", label: "프레임워크 / 버전", symbol: "{ }" },
  { key: "servers", label: "서버 / WAS / 인프라", symbol: "▤" },
  { key: "database", label: "DBMS / 버전", symbol: "▥" },
] as const;
const criteriaBlocks = [
  { key: "deployment", label: "배포 / 네트워크 구성" },
  { key: "security", label: "보안 기준" },
  { key: "performance", label: "성능 기준" },
  { key: "standards", label: "개발 표준 / 인터페이스 / 예외 기준" },
] as const;

export function ArchitectureSummary({ artifact }: { artifact: Artifact }) {
  return (
    <div className="matrix-architecture-summary">
      <header className="matrix-architecture-header">
        <div>
          <span className="matrix-architecture-eyebrow">ARCHITECTURE OVERVIEW · {artifact.code}</span>
          <h3>{artifact.title}</h3>
        </div>
        <span className="matrix-architecture-status">{artifact.status} · v{artifact.version}</span>
      </header>
      <div className="matrix-architecture-overview">
        <h4>시스템 구성 개요</h4>
        <p>{artifact.fields.definition?.trim() || "미등록"}</p>
      </div>
      <div className="matrix-architecture-technologies">
        {technologyBlocks.map((block) => (
          <div className="matrix-architecture-block" key={block.key}>
            <span className="matrix-architecture-symbol" aria-hidden="true">{block.symbol}</span>
            <h4>{block.label}</h4>
            <p>{artifact.fields[block.key]?.trim() || "미등록"}</p>
          </div>
        ))}
      </div>
      <div className="matrix-architecture-criteria">
        {criteriaBlocks.map((block) => (
          <div className="matrix-architecture-block" key={block.key}>
            <h4>{block.label}</h4>
            <p>{artifact.fields[block.key]?.trim() || "미등록"}</p>
          </div>
        ))}
      </div>
      <footer className="matrix-architecture-footer">
        <span>담당자: {artifact.fields.owner?.trim() || "미등록"}</span>
        <span>등록 내용 기반 구성 요약</span>
      </footer>
    </div>
  );
}
