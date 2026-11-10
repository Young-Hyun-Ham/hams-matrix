"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Artifact } from "@/lib/artifact-types";
import { initialArtifactFields } from "@/components/shared/artifact-field-inputs";
import {
  adjustPlannedDates,
  dateFieldRanges,
  wbsDateConstraints,
  validateWbsDates,
} from "@/lib/wbs-date-constraints";

const Context = createContext<ReturnType<typeof useFormState> | null>(null);
export const useWbsForm = () => useContext(Context);
function useFormState(
  artifact: Artifact | null,
  artifacts: Artifact[],
  onModified: () => void,
) {
  const [fields, setFields] = useState(() =>
    initialArtifactFields("wbs", artifact),
  );
  const [structure, setStructure] = useState(() => ({
    parentId: artifact?.structure?.parentId || "",
    dependencies: artifact?.structure?.dependencies || [],
  }));
  const [planTouched, setPlanTouched] = useState(!!artifact?.id);
  const [notice, setNotice] = useState("");
  const task = {
    ...artifact,
    id: artifact?.id || "new-wbs",
    kind: "wbs",
    fields,
    structure,
  } as Artifact;
  const constraints = wbsDateConstraints(task, artifacts);
  function change(key: string, value: string) {
    const next = { ...fields, [key]: value };
    if (key === "startDate" || key === "endDate") setPlanTouched(true);
    if (next.taskType === "마일스톤") {
      for (const [start, end] of [
        ["startDate", "endDate"],
        ["actualStart", "actualEnd"],
      ]) {
        if (key === start) next[end] = value;
        else if (key === end) next[start] = value;
        else if (key === "taskType")
          next[start] = next[end] = next[start] || next[end];
      }
      if (key === "taskType") {
        next.plannedEffort = "0";
        next.progress = next.progress === "100" ? "100" : "0";
      }
    }
    if (key === "actualStart" && !value) next.actualEnd = "";
    setFields(next);
    onModified();
  }
  function changeStructure(next: typeof structure) {
    const c = wbsDateConstraints({ ...task, structure: next }, artifacts);
    const adjusted = c.relationError
      ? fields
      : adjustPlannedDates(fields, c.plan, !planTouched);
    setNotice(
      adjusted.startDate !== fields.startDate ||
        adjusted.endDate !== fields.endDate
        ? "관계의 허용 기간에 맞춰 계획일을 조정했습니다. 작업 기간 길이는 유지했습니다."
        : "",
    );
    setFields(adjusted);
    setStructure(next);
    if (c.hasRelations) setPlanTouched(true);
    onModified();
  }
  return {
    fields,
    structure,
    change,
    changeStructure,
    constraints,
    ranges: dateFieldRanges(fields, constraints.plan, constraints.actual),
    notice,
    error: validateWbsDates(task, artifacts),
    applyActual: () => {
      if (constraints.actualKnown && constraints.actual.min)
        change("actualStart", constraints.actual.min);
    },
  };
}
export function WbsFormProvider({
  artifact,
  artifacts,
  onModified,
  children,
}: {
  artifact: Artifact | null;
  artifacts: Artifact[];
  onModified: () => void;
  children: ReactNode;
}) {
  const value = useFormState(artifact, artifacts, onModified);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
