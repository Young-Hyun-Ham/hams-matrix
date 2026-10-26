"use client";
import { useState } from "react";
import type { TableColumn } from "@/lib/artifact-types";
import type { StructureEditorProps } from "@/components/shared/artifact-structure-editor";
export function DatabaseStructureEditor({
  artifact,
  artifacts,
}: StructureEditorProps) {
  const [columns, setColumns] = useState<TableColumn[]>(
    artifact?.structure?.columns ?? [],
  );
  const tables = artifacts.filter((a) => a.kind === "database");
  const update = (index: number, patch: Partial<TableColumn>) =>
    setColumns((cols) =>
      cols.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  return (
    <fieldset className="matrix-structure">
      <legend>테이블 컬럼 / PK / FK</legend>
      <p>
        단일 컬럼 FK를 구조화하여 저장합니다. 복합키 관계는 제약조건에 기술해
        주세요.
      </p>
      <input type="hidden" name="columns" value={JSON.stringify(columns)} />
      {columns.map((c, index) => {
        const referenceTables = [
          ...tables.filter((a) => a.id !== artifact?.id),
          ...(artifact
            ? [{ ...artifact, structure: { ...artifact.structure, columns } }]
            : []),
        ];
        const target = referenceTables.find(
          (t) => t.id === c.reference?.tableId,
        );
        return (
          <fieldset className="matrix-column" key={c.id}>
            <legend>
              컬럼 {index + 1} · {c.name || "새 컬럼"}
            </legend>
            <div className="matrix-field-grid">
              <label>
                컬럼명 *
                <input
                  required
                  maxLength={100}
                  value={c.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </label>
              <label>
                자료형 *
                <input
                  required
                  placeholder="VARCHAR, BIGINT 등"
                  maxLength={80}
                  value={c.dataType}
                  onChange={(e) => update(index, { dataType: e.target.value })}
                />
              </label>
              <label>
                길이 / 정밀도
                <input
                  maxLength={40}
                  value={c.length}
                  onChange={(e) => update(index, { length: e.target.value })}
                />
              </label>
              <label>
                기본값
                <input
                  maxLength={200}
                  value={c.defaultValue}
                  onChange={(e) =>
                    update(index, { defaultValue: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              논리명 / 설명
              <input
                maxLength={1000}
                value={c.description}
                onChange={(e) => update(index, { description: e.target.value })}
              />
            </label>
            <div className="matrix-check-row">
              <label>
                <input
                  type="checkbox"
                  checked={c.primaryKey}
                  onChange={(e) =>
                    update(index, {
                      primaryKey: e.target.checked,
                      ...(e.target.checked ? { nullable: false } : {}),
                    })
                  }
                />
                PK
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={c.nullable}
                  disabled={c.primaryKey}
                  onChange={(e) =>
                    update(index, { nullable: e.target.checked })
                  }
                />
                NULL 허용
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={c.unique}
                  onChange={(e) => update(index, { unique: e.target.checked })}
                />
                UNIQUE
              </label>
            </div>
            <div className="matrix-field-grid">
              <label>
                FK 참조 테이블
                <select
                  value={c.reference?.tableId ?? ""}
                  onChange={(e) =>
                    update(index, {
                      reference: e.target.value
                        ? { tableId: e.target.value, columnId: "" }
                        : undefined,
                    })
                  }
                >
                  <option value="">참조 없음</option>
                  {referenceTables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.fields.physicalName || t.title}
                    </option>
                  ))}
                </select>
              </label>
              {c.reference && (
                <label>
                  FK 참조 컬럼
                  <select
                    required
                    value={c.reference.columnId}
                    onChange={(e) =>
                      update(index, {
                        reference: {
                          tableId: c.reference!.tableId,
                          columnId: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="">컬럼 선택</option>
                    {target?.structure?.columns
                      ?.filter(
                        (col) =>
                          col.unique ||
                          (col.primaryKey &&
                            target.structure?.columns?.filter(
                              (x) => x.primaryKey,
                            ).length === 1),
                      )
                      .map((col) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <button
              type="button"
              className="button"
              onClick={() =>
                setColumns((cols) => cols.filter((_, i) => i !== index))
              }
            >
              컬럼 삭제
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="button"
        disabled={columns.length >= 100}
        onClick={() =>
          setColumns((cols) => [
            ...cols,
            {
              id: crypto.randomUUID(),
              name: "",
              description: "",
              dataType: "VARCHAR",
              length: "",
              nullable: true,
              primaryKey: false,
              unique: false,
              defaultValue: "",
            },
          ])
        }
      >
        컬럼 추가
      </button>
    </fieldset>
  );
}
