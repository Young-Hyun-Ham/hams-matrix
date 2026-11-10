"use client";
import { useState } from "react";
import type { TableColumn } from "@/lib/artifact-types";
import type { StructureEditorProps } from "@/components/shared/artifact-structure-editor";
import type {
  DatabaseDomain,
  DomainSelection,
} from "@/lib/database-domain-types";
import { databaseTypeLabel } from "@/lib/database-data-types";
import { DatabaseDomainSelect } from "./database-domain-select";
type ColumnDraft = TableColumn & { domainSelection?: DomainSelection | null };
export function DatabaseStructureEditor({
  artifact,
  artifacts,
  projectId,
  onModified,
  disabled,
}: StructureEditorProps) {
  const [columns, setColumns] = useState<ColumnDraft[]>(
    artifact?.structure?.columns ?? [],
  );
  const [selectedDomains, setSelectedDomains] = useState<
    Record<string, DatabaseDomain>
  >({});
  const tables = artifacts.filter((a) => a.kind === "database");
  const update = (index: number, patch: Partial<ColumnDraft>) =>
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
        const linked =
          c.domainSelection !== null &&
          !!(c.domainSelection || c.domainReference);
        const selectedDomain = c.domainSelection
          ? selectedDomains[c.id]
          : c.domainReference;
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
                논리 컬럼명
                <input
                  maxLength={100}
                  value={c.logicalName ?? ""}
                  readOnly={linked}
                  onChange={(e) =>
                    update(index, { logicalName: e.target.value })
                  }
                />
              </label>
              <label>
                컬럼명 *
                <input
                  required
                  maxLength={100}
                  value={c.name}
                  readOnly={linked}
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </label>
              {projectId && (
                <DatabaseDomainSelect
                  key={`${projectId}:${c.id}`}
                  projectId={projectId}
                  columnName={c.name.trim() || c.logicalName?.trim() || ""}
                  disabled={disabled}
                  selected={linked}
                  value={
                    linked && selectedDomain
                      ? `${c.logicalName} / ${c.name} / ${databaseTypeLabel(selectedDomain.databaseType)} / ${c.dataType}${c.length ? `(${c.length})` : ""}`
                      : ""
                  }
                  onSelect={(domain) => {
                    if (domain) {
                      setSelectedDomains((old) => ({ ...old, [c.id]: domain }));
                      update(index, {
                        logicalName: domain.logicalName,
                        name: domain.physicalName,
                        dataType: domain.dataType,
                        length: domain.length,
                        domainSelection: {
                          domainId: domain.id,
                          domainVersion: domain.version,
                        },
                      });
                    } else update(index, { domainSelection: null });
                    onModified?.();
                  }}
                />
              )}
              <label>
                자료형 *
                <input
                  required
                  placeholder="VARCHAR, BIGINT 등"
                  maxLength={80}
                  value={c.dataType}
                  readOnly={linked}
                  onChange={(e) => update(index, { dataType: e.target.value })}
                />
              </label>
              <label>
                길이 / 정밀도
                <input
                  maxLength={40}
                  value={c.length}
                  readOnly={linked}
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
              설명
              <input
                maxLength={1000}
                value={c.description}
                onChange={(e) => update(index, { description: e.target.value })}
              />
            </label>
            {c.domainBinding && (
              <p>
                생성 메타 v{c.domainBinding.domainVersion} ·{" "}
                {c.domainBinding.sourceLogicalName} →{" "}
                {c.domainBinding.physicalName} · {c.domainBinding.dataType}
                {c.domainBinding.length
                  ? `(${c.domainBinding.length})`
                  : ""}{" "}
                (생성 당시 기준)
              </p>
            )}
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
