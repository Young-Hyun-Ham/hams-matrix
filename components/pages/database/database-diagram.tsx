"use client";
import type { Artifact } from "@/lib/artifact-types";

export function DatabaseDiagram({ artifacts }: { artifacts: Artifact[] }) {
  const tables = artifacts.filter((a) => a.kind === "database");
  if (!tables.length) return null;
  const rowHeights: number[] = [];
  tables.forEach((t, i) => {
    const row = Math.floor(i / 2);
    rowHeights[row] = Math.max(
      rowHeights[row] ?? 0,
      90 + (t.structure?.columns?.length ?? 0) * 25,
    );
  });
  const top = (index: number) =>
    20 +
    rowHeights.slice(0, Math.floor(index / 2)).reduce((n, v) => n + v + 60, 0);
  const height = rowHeights.reduce((n, v) => n + v + 60, 40);
  const edges = tables.flatMap((table, i) =>
    (table.structure?.columns ?? []).flatMap((c, j) => {
      if (!c.reference) return [];
      const targetIndex = tables.findIndex(
        (t) => t.id === c.reference!.tableId,
      );
      if (targetIndex < 0) return [];
      const targetColumn =
        tables[targetIndex].structure?.columns?.findIndex(
          (col) => col.id === c.reference!.columnId,
        ) ?? 0;
      const direction =
        i % 2 === targetIndex % 2 ? 1 : i % 2 < targetIndex % 2 ? 1 : -1;
      const sameColumn = i % 2 === targetIndex % 2;
      const x1 = 30 + (i % 2) * 430 + (direction > 0 ? 330 : 0);
      const x2 =
        30 + (targetIndex % 2) * 430 + (sameColumn || direction < 0 ? 330 : 0);
      return [
        {
          key: `${table.id}:${c.id}`,
          source: table,
          column: c,
          target: tables[targetIndex],
          x1,
          c1: x1 + direction * 40,
          y1: top(i) + 65 + j * 25,
          x2,
          c2: x2 + (sameColumn ? 40 : -direction * 40),
          y2: top(targetIndex) + 65 + targetColumn * 25,
        },
      ];
    }),
  );
  return (
    <section className="panel matrix-section">
      <h2>ERD · 테이블 관계</h2>
      <p>
        컬럼의 PK / UNIQUE와 FK 연결을 기준으로 표시합니다. 컬럼은 테이블
        상세에서 편집하세요.
      </p>
      <div className="table-scroll">
        <svg
          width="850"
          height={height}
          role="img"
          aria-label="테이블 컬럼과 외래키 관계도"
        >
          <defs>
            <marker
              id="matrix-fk-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--primary)" />
            </marker>
          </defs>
          {edges.map((e) => (
            <path
              key={e.key}
              d={`M ${e.x1} ${e.y1} C ${e.c1} ${e.y1}, ${e.c2} ${e.y2}, ${e.x2} ${e.y2}`}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="1.5"
              markerEnd="url(#matrix-fk-arrow)"
            />
          ))}
          {tables.map((t, i) => (
            <g
              key={t.id}
              transform={`translate(${30 + (i % 2) * 430},${top(i)})`}
            >
              <rect
                width="330"
                height={rowHeights[Math.floor(i / 2)]}
                rx="10"
                fill="var(--surface)"
                stroke="var(--line)"
              />
              <rect
                width="330"
                height="40"
                rx="10"
                fill="var(--primary-soft)"
              />
              <text x="12" y="25" fill="var(--ink)" fontSize="13">
                {t.code} · {t.fields.physicalName}
              </text>
              {t.structure?.columns?.map((c, j) => (
                <text
                  key={c.id}
                  x="12"
                  y={65 + j * 25}
                  fill="var(--ink)"
                  fontSize="12"
                >
                  {c.primaryKey ? "PK " : c.reference ? "FK " : ""}
                  {c.name} · {c.dataType}
                  {c.length ? `(${c.length})` : ""}
                  {c.nullable ? "" : " NOT NULL"}
                </text>
              ))}
            </g>
          ))}
        </svg>
      </div>
      <ul>
        {edges.map((e) => (
          <li key={e.key}>
            {e.source.fields.physicalName}.{e.column.name} →{" "}
            {e.target.fields.physicalName}.
            {
              e.target.structure?.columns?.find(
                (c) => c.id === e.column.reference?.columnId,
              )?.name
            }
          </li>
        ))}
      </ul>
    </section>
  );
}
