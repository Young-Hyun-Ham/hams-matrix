"use client";

import { useWbsForm } from "./wbs-form-state";
import type { StructureEditorProps } from "@/components/shared/artifact-structure-editor";
export function WbsStructureEditor({
  artifact,
  artifacts,
}: StructureEditorProps) {
  const shared = useWbsForm();
  const tasks = artifacts.filter(
    (a) => a.kind === "wbs" && a.id !== artifact?.id,
  );
  return (
    <fieldset className="matrix-structure">
      <legend>작업 계층과 선행 관계</legend>
      <label>
        상위 요약 작업
        <select
          name="parentId"
          {...(shared
            ? {
                value: shared.structure.parentId,
                onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                  shared.changeStructure({
                    ...shared.structure,
                    parentId: event.target.value,
                  }),
              }
            : { defaultValue: artifact?.structure?.parentId ?? "" })}
        >
          <option value="">최상위</option>
          {tasks
            .filter((a) => a.fields.taskType === "요약")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.title}
              </option>
            ))}
        </select>
      </label>
      <fieldset className="matrix-links">
        <legend>선행 작업 (완료 후 시작)</legend>
        {tasks
          .filter((a) => a.fields.taskType !== "요약")
          .map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                name="dependencies"
                value={a.id}
                {...(shared
                  ? {
                      checked: shared.structure.dependencies.includes(a.id),
                      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                        shared.changeStructure({
                          ...shared.structure,
                          dependencies: event.target.checked
                            ? [...shared.structure.dependencies, a.id]
                            : shared.structure.dependencies.filter(
                                (id) => id !== a.id,
                              ),
                        }),
                    }
                  : {
                      defaultChecked:
                        artifact?.structure?.dependencies?.includes(a.id),
                    })}
              />
              {a.code} · {a.title}
            </label>
          ))}
      </fieldset>
      {shared && (
        <div id="wbs-date-constraints" aria-live="polite">
          <p>
            계획 허용 기간: {shared.constraints.plan.min || "제한 없음"} ~{" "}
            {shared.constraints.plan.max || "제한 없음"} (선행 종료 당일 시작
            가능)
          </p>
          {shared.notice && <p>{shared.notice}</p>}
          {shared.error && <p className="matrix-error">{shared.error}</p>}
          {shared.constraints.hasRelations && (
            <>
              <p>
                {shared.constraints.actualKnown
                  ? `실제 허용 기간: ${shared.constraints.actual.min || "제한 없음"} ~ ${shared.constraints.actual.max || "제한 없음"}`
                  : "실제 기준 미확정: 상위 실제 시작·종료 및 모든 선행 실제 종료가 확인되면 관계 범위를 적용합니다. 기존 실적은 보존됩니다."}
              </p>
              {shared.constraints.actualKnown &&
                shared.constraints.actual.min && (
                  <button
                    type="button"
                    className="button"
                    disabled={
                      !!shared.fields.actualStart ||
                      !!shared.fields.actualEnd ||
                      !!(
                        shared.constraints.actual.max &&
                        shared.constraints.actual.min >
                          shared.constraints.actual.max
                      )
                    }
                    onClick={shared.applyActual}
                  >
                    실제 시작일 후보 {shared.constraints.actual.min} 적용
                  </button>
                )}
            </>
          )}
        </div>
      )}
    </fieldset>
  );
}
