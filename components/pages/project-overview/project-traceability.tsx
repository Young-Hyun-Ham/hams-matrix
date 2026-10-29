"use client";

import { useId, useState, type CSSProperties } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Info,
  Link2,
  RotateCcw,
} from "lucide-react";

type Category = "plan" | "req" | "design" | "dev" | "test" | "audit";
interface Node {
  id: string;
  label: string;
  category: Category;
  description: string;
}
interface Link {
  source: string;
  target: string;
  label: string;
}

const NODES: Node[] = [
  {
    id: "rfp",
    label: "제안요청서 (RFP)",
    category: "plan",
    description: "발주기관의 사업 범위 및 기본 요구사항 정의",
  },
  {
    id: "plan",
    label: "수행계획서 / WBS",
    category: "plan",
    description: "사업 관리, 투입인력, 일정 및 위험 관리 방안",
  },
  {
    id: "srs",
    label: "요구사항 정의서",
    category: "req",
    description: "기능/비기능 요구사항을 상세화한 기준 문서",
  },
  {
    id: "rtm",
    label: "요구사항 추적표 (RTM)",
    category: "audit",
    description: "요구사항과 설계-구현-테스트 간 1:1 매핑 검증표 (감리 핵심)",
  },
  {
    id: "arch",
    label: "아키텍처 / DB 설계서",
    category: "design",
    description: "HW/SW 구성 및 데이터베이스 테이블(ERD) 정의",
  },
  {
    id: "ui",
    label: "화면 / API 정의서",
    category: "design",
    description: "UI/UX 와이어프레임 및 시스템 간 인터페이스 규격",
  },
  {
    id: "code",
    label: "소스코드 (Git)",
    category: "dev",
    description: "형상 관리되는 실제 소프트웨어 구현체",
  },
  {
    id: "test",
    label: "테스트 시나리오/결과서",
    category: "test",
    description: "단위/통합/시스템 테스트 검증 및 결함 조치 내역",
  },
  {
    id: "audit",
    label: "감리 보고서 / 완료보고서",
    category: "audit",
    description: "최종 검수 및 프로젝트 사업 완료 승인서",
  },
];

const LINKS: Link[] = [
  { source: "rfp", target: "plan", label: "일정/인력 수립" },
  { source: "rfp", target: "srs", label: "요구사항 세부 도출" },
  { source: "srs", target: "rtm", label: "추적 기준 설정" },
  { source: "srs", target: "arch", label: "구조/데이터 설계 반영" },
  { source: "srs", target: "ui", label: "화면/인터페이스 설계" },
  { source: "arch", target: "code", label: "구현" },
  { source: "ui", target: "code", label: "구현" },
  { source: "code", target: "test", label: "검증 수행" },
  { source: "rtm", target: "test", label: "요구사항 대비 테스트 매핑" },
  { source: "test", target: "audit", label: "감리 증적 제출" },
  { source: "rtm", target: "audit", label: "정합성 최종 검증" },
];

const CATEGORIES: Record<
  Category,
  { label: string; color: string; bg: string }
> = {
  plan: { label: "기획/계획", color: "#4c85ce", bg: "#e9f2ff" },
  req: { label: "요구사항", color: "#7851d8", bg: "#f0ebff" },
  design: { label: "설계", color: "#309679", bg: "#e7f7f1" },
  dev: { label: "구현", color: "#a47b26", bg: "#fff3e3" },
  test: { label: "검증", color: "#b76a43", bg: "#fff0e8" },
  audit: { label: "추적/완료", color: "#7a7e91", bg: "#f0f1f5" },
};
const POSITIONS: Record<string, [number, number]> = {
  rfp: [24, 130],
  plan: [24, 250],
  srs: [224, 190],
  rtm: [424, 40],
  arch: [424, 150],
  ui: [424, 260],
  code: [624, 205],
  test: [824, 150],
  audit: [824, 270],
};
const docId = (id: string) =>
  `DOC-${String(NODES.findIndex((node) => node.id === id) + 1).padStart(2, "0")}`;

export default function TraceabilityNetworkPage() {
  const markerId = useId().replace(/:/g, "");
  const [selectedId, setSelectedId] = useState<string | null>("rfp");
  const [filter, setFilter] = useState<Category | "all">("all");
  const selected = NODES.find((node) => node.id === selectedId);
  const upstream = LINKS.filter((link) => link.target === selectedId);
  const downstream = LINKS.filter((link) => link.source === selectedId);
  const connected = new Set([
    selectedId,
    ...upstream.map((link) => link.source),
    ...downstream.map((link) => link.target),
  ]);
  const selectDocument = (id: string) => {
    setSelectedId(id);
    setFilter("all");
  };

  return (
    <div className="traceability">
      <header className="trace-header">
        <div className="trace-heading">
          <span className="trace-icon">
            <Link2 size={20} />
          </span>
          <div>
            <h2>프로젝트 산출물 추적성</h2>
            <p>기획부터 검증까지, 산출물의 연결 관계를 확인하세요.</p>
          </div>
        </div>
        <span className="trace-count">
          산출물 <b>{NODES.length}</b>
          <span />
          연결 <b>{LINKS.length}</b>
        </span>
      </header>

      <div className="trace-toolbar">
        <div
          className="trace-filters"
          role="group"
          aria-label="산출물 단계 필터"
        >
          <span className="trace-filter-label">단계</span>
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            전체 보기
          </button>
          {(Object.keys(CATEGORIES) as Category[]).map((category) => (
            <button
              type="button"
              key={category}
              aria-pressed={filter === category}
              onClick={() => {
                setFilter(category);
                setSelectedId(null);
              }}
            >
              <i style={{ background: CATEGORIES[category].color }} />
              {CATEGORIES[category].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="trace-reset"
          onClick={() => {
            setSelectedId(null);
            setFilter("all");
          }}
        >
          <RotateCcw size={13} />
          선택 초기화
        </button>
      </div>

      <div
        className="trace-graph-scroll"
        role="region"
        aria-label="산출물 추적성 네트워크"
        tabIndex={0}
      >
        <div className="trace-graph">
          <svg
            className="trace-edges"
            viewBox="0 0 1020 390"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
              </marker>
            </defs>
            {LINKS.map((link) => {
              const [sx, sy] = POSITIONS[link.source];
              const [tx, ty] = POSITIONS[link.target];
              const vertical = sx === tx;
              const x1 = vertical ? sx + 86 : sx + 172;
              const y1 = vertical ? sy + 66 : sy + 33;
              const x2 = vertical ? tx + 86 : tx;
              const y2 = vertical ? ty : ty + 33;
              const highlighted =
                selectedId === link.source || selectedId === link.target;
              const inFilter =
                filter === "all" ||
                NODES.some(
                  (node) =>
                    node.category === filter &&
                    (node.id === link.source || node.id === link.target),
                );
              return (
                <path
                  key={`${link.source}-${link.target}`}
                  d={
                    vertical
                      ? `M ${x1} ${y1} L ${x2} ${y2 - 4}`
                      : `M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2 - 4} ${y2}`
                  }
                  fill="none"
                  stroke={highlighted ? "var(--primary)" : "#cdd1df"}
                  strokeWidth={highlighted ? 2 : 1.3}
                  opacity={inFilter && (!selectedId || highlighted) ? 1 : 0.22}
                  markerEnd={`url(#${markerId})`}
                />
              );
            })}
          </svg>
          {NODES.map((node) => {
            const category = CATEGORIES[node.category];
            const dimmed =
              (filter !== "all" && filter !== node.category) ||
              (!!selectedId && !connected.has(node.id));
            return (
              <button
                type="button"
                key={node.id}
                className={`trace-node${selectedId === node.id ? " selected" : ""}${dimmed ? " dimmed" : ""}`}
                aria-pressed={selectedId === node.id}
                onClick={() => selectDocument(node.id)}
                style={
                  {
                    left: `${POSITIONS[node.id][0] / 10.2}%`,
                    top: POSITIONS[node.id][1],
                    "--node-color": category.color,
                    "--node-bg": category.bg,
                  } as CSSProperties
                }
              >
                <span className="trace-node-meta">
                  <span>{docId(node.id)}</span>
                  <span>{category.label}</span>
                </span>
                <strong title={node.label}>{node.label}</strong>
              </button>
            );
          })}
        </div>
      </div>
      <div className="trace-hint">
        <Info size={13} />
        산출물을 선택하면 선행 문서와 후행 영향 범위가 강조됩니다.
      </div>

      <section
        className="trace-detail"
        aria-label="선택한 산출물 상세"
        aria-live="polite"
      >
        {selected ? (
          <>
            <div className="trace-detail-heading">
              <div>
                <span className="trace-doc-id">{docId(selected.id)}</span>
                <h3>{selected.label}</h3>
              </div>
              <span
                className="trace-category"
                style={{
                  color: CATEGORIES[selected.category].color,
                  background: CATEGORIES[selected.category].bg,
                }}
              >
                {CATEGORIES[selected.category].label}
              </span>
            </div>
            <p className="trace-description">{selected.description}</p>
            <div className="trace-relations">
              {[
                {
                  title: "선행 산출물",
                  subtitle: "Upstream",
                  links: upstream,
                  incoming: true,
                },
                {
                  title: "후행 영향 산출물",
                  subtitle: "Downstream",
                  links: downstream,
                  incoming: false,
                },
              ].map((group) => (
                <div key={group.subtitle}>
                  <h4>
                    {group.incoming ? (
                      <ArrowDownLeft size={14} />
                    ) : (
                      <ArrowUpRight size={14} />
                    )}
                    {group.title}
                    <span>
                      {group.subtitle} ? {group.links.length}
                    </span>
                  </h4>
                  <div className="trace-related-list">
                    {group.links.length ? (
                      group.links.map((link) => {
                        const partner = NODES.find(
                          (node) =>
                            node.id ===
                            (group.incoming ? link.source : link.target),
                        )!;
                        return (
                          <button
                            type="button"
                            key={partner.id}
                            onClick={() => selectDocument(partner.id)}
                            title={link.label}
                          >
                            <FileText size={13} />
                            <span>
                              {docId(partner.id)}
                              <b>{partner.label}</b>
                            </span>
                            <ArrowUpRight size={13} />
                          </button>
                        );
                      })
                    ) : (
                      <p className="trace-empty-relation">
                        {group.incoming
                          ? "연결된 선행 산출물이 없습니다."
                          : "연결된 후행 산출물이 없습니다."}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="trace-empty">
            <FileText size={25} />
            <strong>산출물을 선택해 주세요</strong>
            <p>
              그래프에서 문서를 선택하면 상세 설명과 연결된 산출물을 확인할 수
              있습니다.
            </p>
          </div>
        )}
      </section>

      <style jsx>{`
        .traceability {
          color: var(--ink);
          min-width: 0;
        }
        .trace-header,
        .trace-heading,
        .trace-toolbar,
        .trace-filters,
        .trace-count,
        .trace-detail-heading,
        .trace-detail-heading > div {
          display: flex;
          align-items: center;
        }
        .trace-header {
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 22px;
          flex-wrap: wrap;
        }
        .trace-heading {
          gap: 12px;
        }
        .trace-icon {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: var(--primary-soft);
          color: var(--primary);
        }
        .traceability h2 {
          margin: 0 0 5px;
          font-size: 17px;
          letter-spacing: -0.4px;
        }
        .trace-heading p {
          margin: 0;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.6;
        }
        .trace-count {
          gap: 7px;
          font-size: 11px;
          color: var(--muted);
        }
        .trace-count b {
          color: var(--ink);
          font-size: 13px;
        }
        .trace-count > span {
          height: 10px;
          width: 1px;
          margin: 0 5px;
          background: var(--line);
        }
        .trace-toolbar {
          gap: 12px;
          justify-content: space-between;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .trace-filters {
          gap: 5px;
          flex-wrap: wrap;
        }
        .trace-filter-label {
          color: var(--muted);
          font-size: 12px;
          margin-right: 6px;
        }
        .trace-filters button,
        .trace-reset {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border: 1px solid transparent;
          background: var(--canvas);
          border-radius: 7px;
          padding: 8px 11px;
          font-size: 11px;
          font-weight: 600;
        }
        .trace-filters button[aria-pressed="true"] {
          color: var(--primary);
          background: var(--primary-soft);
          border-color: #dcd3ff;
        }
        .trace-filters i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .trace-reset {
          color: var(--muted);
          background: var(--surface);
          border-color: var(--line);
        }
        .trace-filters button:hover,
        .trace-reset:hover {
          color: var(--primary);
        }
        .trace-graph-scroll {
          overflow-x: auto;
          border: 1px solid var(--line);
          border-radius: 12px;
          background:
            radial-gradient(circle, #dfe1ed 1px, transparent 1px) 0 0 / 18px
              18px,
            var(--canvas);
        }
        .trace-graph {
          position: relative;
          min-width: 1020px;
          height: 390px;
        }
        .trace-edges {
          position: absolute;
          width: 100%;
          height: 100%;
        }
        .trace-node {
          position: absolute;
          width: 16.862745%;
          height: 66px;
          text-align: left;
          background: var(--surface);
          border: 1px solid var(--line);
          border-left: 3px solid var(--node-color);
          border-radius: 9px;
          padding: 11px 12px;
          box-shadow: 0 3px 10px #20233505;
          transition:
            opacity 0.15s,
            box-shadow 0.15s,
            border-color 0.15s;
        }
        .trace-node:hover {
          box-shadow: 0 4px 16px #6d51e81a;
          border-color: var(--node-color);
        }
        .trace-node.selected {
          border-color: var(--primary);
          background: var(--primary-soft);
          box-shadow: 0 0 0 3px #6d51e814;
        }
        .trace-node.dimmed {
          opacity: 0.4;
        }
        .trace-node.dimmed:hover,
        .trace-node.dimmed:focus-visible {
          opacity: 1;
        }
        .trace-node-meta {
          display: flex;
          justify-content: space-between;
          gap: 4px;
          margin-bottom: 8px;
          font-size: 10px;
          color: var(--muted);
        }
        .trace-node-meta > span:last-child {
          color: var(--node-color);
        }
        .trace-node strong {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 600;
        }
        .trace-hint {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--muted);
          font-size: 11px;
          line-height: 1.6;
          padding: 11px 2px 17px;
        }
        .trace-detail {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 20px;
          background: var(--surface);
        }
        .trace-detail-heading {
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          border-bottom: 1px solid var(--line);
          padding-bottom: 14px;
        }
        .trace-detail-heading > div {
          gap: 9px;
          flex-wrap: wrap;
        }
        .trace-doc-id {
          font-size: 11px;
          color: var(--primary);
          background: var(--primary-soft);
          border-radius: 5px;
          padding: 5px 7px;
          font-family: monospace;
        }
        .trace-detail h3 {
          margin: 0;
          font-size: 15px;
        }
        .trace-category {
          padding: 5px 9px;
          border-radius: 5px;
          font-size: 11px;
          font-weight: 600;
        }
        .trace-description {
          margin: 14px 0 20px;
          font-size: 12px;
          color: var(--muted);
          line-height: 1.8;
        }
        .trace-relations {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 24px;
        }
        .trace-relations h4 {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 5px;
          margin: 0 0 10px;
          font-size: 12px;
          font-weight: 600;
        }
        .trace-relations h4 span {
          color: var(--muted);
          font-size: 10px;
          font-weight: 400;
          margin-left: 4px;
        }
        .trace-related-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .trace-related-list button {
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid var(--line);
          border-radius: 7px;
          background: var(--canvas);
          padding: 8px 10px;
          color: var(--muted);
          text-align: left;
          font-size: 10px;
          max-width: 100%;
        }
        .trace-related-list button:hover {
          border-color: var(--primary);
          color: var(--primary);
        }
        .trace-related-list button b {
          font-size: 11px;
          color: var(--ink);
          margin-left: 6px;
          font-weight: 500;
        }
        .trace-empty-relation {
          color: var(--muted);
          font-size: 12px;
          margin: 3px 0;
        }
        .trace-empty {
          display: grid;
          justify-items: center;
          gap: 10px;
          padding: 15px;
          color: var(--muted);
          text-align: center;
        }
        .trace-empty strong {
          font-size: 13px;
          color: var(--ink);
        }
        .trace-empty p {
          margin: 0;
          font-size: 12px;
          line-height: 1.7;
        }
        @media (max-width: 640px) {
          .trace-relations {
            grid-template-columns: 1fr;
            gap: 20px;
          }
          .trace-detail {
            padding: 16px;
          }
          .trace-count {
            margin-left: 54px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .trace-node {
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
