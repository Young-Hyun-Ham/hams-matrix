"use client";
import { useState } from "react";
import type { Artifact } from "@/lib/artifact-types";
import {
  ArtifactFieldInputs,
  initialArtifactFields,
} from "@/components/shared/artifact-field-inputs";
export function WbsFields({
  artifact,
  isExisting,
  calendarOnly = false,
}: {
  artifact: Artifact | null;
  isExisting: boolean;
  calendarOnly?: boolean;
}) {
  const kind = "wbs";
  const [fields, setFields] = useState(() =>
    initialArtifactFields(kind, artifact),
  );
  function change(key: string, value: string) {
    setFields((previous) => {
      const next = { ...previous, [key]: value };
      if (kind !== "wbs") return next;
      if (next.taskType === "마일스톤") {
        for (const [start, end] of [
          ["startDate", "endDate"],
          ["actualStart", "actualEnd"],
        ]) {
          if (key === start) next[end] = value;
          else if (key === end) next[start] = value;
          else if (key === "taskType") {
            const date = next[start] || next[end];
            next[start] = date;
            next[end] = date;
          }
        }
      }
      return next;
    });
  }
  return (
    <ArtifactFieldInputs
      kind={kind}
      isExisting={isExisting}
      fields={fields}
      change={change}
      calendarOnly={calendarOnly}
    />
  );
}
