"use client";
import type { Artifact } from "@/lib/artifact-types";
import { useWbsForm } from "./wbs-form-state";
export function WbsDeliverableLinks({
  targets,
  artifact,
}: {
  targets: Artifact[];
  artifact: Artifact | null;
}) {
  const shared = useWbsForm();
  const summary = shared?.fields.taskType === "요약";
  return (
    <fieldset className="matrix-links">
      <legend>일정에 배정할 문서 / 개발 프로그램</legend>
      {summary && (
        <p>
          요약 작업은 하위 작업을 집계합니다. 저장 시 직접 배정한 문서와 선행
          관계는 해제됩니다. 문서와 선행 작업은 하위 실제 작업에 배정해 주세요.
        </p>
      )}
      {!targets.length && (
        <p>연결할 항목이 없습니다. 상위 항목을 먼저 등록해 주세요.</p>
      )}
      <fieldset disabled={summary} style={{ border: 0, padding: 0, margin: 0 }}>
        {targets.map((target) => (
          <label key={target.id}>
            <input
              type="checkbox"
              name="links"
              value={target.id}
              defaultChecked={artifact?.links.includes(target.id)}
            />
            {target.code} · {target.title}
          </label>
        ))}
      </fieldset>
    </fieldset>
  );
}
