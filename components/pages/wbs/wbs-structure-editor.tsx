"use client";

import type { StructureEditorProps } from "@/components/shared/artifact-structure-editor";
export function WbsStructureEditor({
  artifact,
  artifacts,
}: StructureEditorProps) {
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
          defaultValue={artifact?.structure?.parentId ?? ""}
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
                defaultChecked={artifact?.structure?.dependencies?.includes(
                  a.id,
                )}
              />
              {a.code} · {a.title}
            </label>
          ))}
      </fieldset>
    </fieldset>
  );
}
