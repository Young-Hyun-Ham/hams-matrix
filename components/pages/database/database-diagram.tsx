"use client";
import { useEffect, useRef, useState } from "react";
import type { Artifact } from "@/lib/artifact-types";
import { databaseDeleteReason } from "@/lib/database-relations";
import { DatabaseErdPreview } from "./database-erd-preview";

export function DatabaseDiagram({
  artifacts,
  onEdit,
  onDelete,
  canUpdate = false,
  canDelete = false,
  projectId,
}: {
  artifacts: Artifact[];
  onEdit?: (table: Artifact) => void;
  onDelete?: (table: Artifact) => void;
  canUpdate?: boolean;
  canDelete?: boolean;
  projectId?: string;
}) {
  const tables = artifacts.filter((a) => a.kind === "database");
  const canvas = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const hasTables = tables.length > 0;
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasTables]);
  // Keep card text readable and reserve room for FK curves at either edge.
  const columnCount = Math.min(
    3,
    tables.length || 1,
    Math.max(1, Math.floor((availableWidth + 10) / 430)),
  );
  const width = columnCount * 430 - 10;
  if (!tables.length)
    return (
      <section className="panel matrix-section">
        <h2>ERD · 테이블 관계</h2>
        <p>등록된 테이블이 없습니다. DB설계에서 테이블을 먼저 등록해 주세요.</p>
      </section>
    );
  const rowHeights: number[] = [];
  tables.forEach((t, i) => {
    const row = Math.floor(i / columnCount);
    rowHeights[row] = Math.max(
      rowHeights[row] ?? 0,
      90 + (t.structure?.columns?.length ?? 0) * 25,
    );
  });
  const top = (index: number) =>
    20 +
    rowHeights
      .slice(0, Math.floor(index / columnCount))
      .reduce((n, v) => n + v + 60, 0);
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
      const direction = i % columnCount <= targetIndex % columnCount ? 1 : -1;
      const sameColumn = i % columnCount === targetIndex % columnCount;
      const x1 = 30 + (i % columnCount) * 430 + (direction > 0 ? 330 : 0);
      const x2 =
        30 +
        (targetIndex % columnCount) * 430 +
        (sameColumn || direction < 0 ? 330 : 0);
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
      <div className="database-erd-section-header">
        <h2>ERD · 테이블 관계</h2>
        {projectId && (
          <DatabaseErdPreview
            key={projectId}
            projectId={projectId}
            canWrite={canUpdate}
          />
        )}
      </div>
      <p>
        컬럼의 PK / UNIQUE와 FK 연결을 기준으로 표시합니다. 컬럼은 테이블
        상세에서 편집하세요.
      </p>
      <div className="table-scroll" ref={canvas}>
        <svg
          width={width}
          height={height}
          role={onEdit || onDelete ? "group" : "img"}
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
              transform={`translate(${30 + (i % columnCount) * 430},${top(i)})`}
            >
              <rect
                width="330"
                height={rowHeights[Math.floor(i / columnCount)]}
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
              <foreignObject x="0" y="0" width="330" height="40">
                <div
                  className="database-card-header"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    height: 40,
                    padding: "0 10px",
                    color: "var(--ink)",
                    fontSize: 12,
                  }}
                >
                  <span
                    title={`${t.code} · ${t.fields.physicalName}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.code} · {t.fields.physicalName}
                  </span>
                  {canUpdate && onEdit && (
                    <button
                      type="button"
                      className="button"
                      aria-label={`${t.fields.physicalName} 수정`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(t);
                      }}
                    >
                      수정
                    </button>
                  )}
                  {canDelete && onDelete && (
                    <button
                      type="button"
                      className="button"
                      aria-label={`${t.fields.physicalName} 삭제`}
                      aria-describedby={
                        databaseDeleteReason(t, artifacts)
                          ? `delete-reason-${t.id}`
                          : undefined
                      }
                      disabled={!!databaseDeleteReason(t, artifacts)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(t);
                      }}
                    >
                      삭제
                    </button>
                  )}
                </div>
              </foreignObject>
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
      {canDelete &&
        tables
          .filter((t) => databaseDeleteReason(t, artifacts))
          .map((t) => (
            <p id={`delete-reason-${t.id}`} key={t.id} tabIndex={0}>
              {t.fields.physicalName}: {databaseDeleteReason(t, artifacts)}
            </p>
          ))}
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
