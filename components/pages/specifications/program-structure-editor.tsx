"use client";
import { useState } from "react";
import type { TableOperation } from "@/lib/artifact-types";
import type { StructureEditorProps } from "@/components/shared/artifact-structure-editor";
export function ProgramStructureEditor({
  artifact,
  artifacts,
}: StructureEditorProps) {
  const [operations, setOperations] = useState<TableOperation[]>(
    artifact?.structure?.tableOperations ?? [],
  );
  const tables = artifacts.filter((a) => a.kind === "database");
  return (
    <fieldset className="matrix-structure">
      <legend>테이블별 CRUD / 기술 검토</legend>
      <input
        type="hidden"
        name="tableOperations"
        value={JSON.stringify(operations)}
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>테이블</th>
              {["C", "R", "U", "D"].map((op) => (
                <th key={op}>{op}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.code} · {t.fields.physicalName}
                </td>
                {(["C", "R", "U", "D"] as const).map((op) => (
                  <td key={op}>
                    <input
                      type="checkbox"
                      aria-label={`${t.code} ${op}`}
                      checked={operations.some(
                        (o) => o.tableId === t.id && o.operations.includes(op),
                      )}
                      onChange={(e) =>
                        setOperations((list) => {
                          const current =
                            list.find((o) => o.tableId === t.id)?.operations ??
                            [];
                          const next = e.target.checked
                            ? [...current, op]
                            : current.filter((v) => v !== op);
                          return [
                            ...list.filter((o) => o.tableId !== t.id),
                            ...(next.length
                              ? [{ tableId: t.id, operations: next }]
                              : []),
                          ];
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!tables.length && <p>테이블 정의서를 먼저 등록해 주세요.</p>}
      <label className="matrix-confirm">
        <input type="checkbox" name="confirmReview" />
        준수 또는 예외 승인으로 저장할 때, 현재 연결 아키텍처 버전을 검토했음을
        확인합니다.
      </label>
    </fieldset>
  );
}
