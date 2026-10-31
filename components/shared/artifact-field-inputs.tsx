"use client";
import { useId } from "react";
import {
  definitions,
  requirementCategories,
  type Artifact,
  type ArtifactKind,
} from "@/lib/artifact-types";
import { DateInput } from "./date-input";
import { WbsDatePicker } from "@/components/pages/wbs/wbs-date-picker";
export function initialArtifactFields(
  kind: ArtifactKind,
  artifact: Artifact | null,
): Record<string, string> {
  return Object.fromEntries(
    definitions[kind].fields.map((f) => [
      f.key,
      artifact?.fields[f.key] || f.defaultValue || f.options?.[0] || "",
    ]),
  );
}
export function ArtifactFieldInputs({
  kind,
  isExisting,
  fields,
  change,
  calendarOnly = false,
}: {
  kind: ArtifactKind;
  isExisting: boolean;
  fields: Record<string, string>;
  change: (key: string, value: string) => void;
  calendarOnly?: boolean;
}) {
  const prefix = useId();
  return (
    <>
      {definitions[kind].fields.map((f) => {
        const id = `${prefix}-${f.key}`;
        return (
          <div className="matrix-field" key={f.key}>
            <label htmlFor={id}>
              {f.label}
              {f.required ? " *" : ""}
            </label>
            {f.options ? (
              <select
                id={id}
                name={f.key}
                required={f.required}
                disabled={f.key === "category" && isExisting}
                value={fields[f.key]}
                onChange={(e) => change(f.key, e.target.value)}
              >
                {f.options.map((option) => (
                  <option key={option} value={option}>
                    {f.key === "category"
                      ? `${option} · ${requirementCategories[option as keyof typeof requirementCategories]}`
                      : option}
                  </option>
                ))}
              </select>
            ) : kind === "architecture" && f.key === "owner" ? (
              <input id={id} name={f.key} maxLength={3000} value={fields[f.key]} onChange={(e) => change(f.key, e.target.value)} />
            ) : f.type === "date" && calendarOnly ? (
              <WbsDatePicker label={f.label} name={f.key} value={fields[f.key]} required={f.required} onChange={(value) => change(f.key, value)} />
            ) : f.type === "date" ? (
              <DateInput
                id={id}
                name={f.key}
                label={f.label}
                value={fields[f.key]}
                onChange={(value) => change(f.key, value)}
                required={f.required}
              />
            ) : f.type === "number" ? (
              <input
                id={id}
                name={f.key}
                type="number"
                required={f.required}
                min={0}
                step="any"
                value={fields[f.key]}
                onChange={(e) => change(f.key, e.target.value)}
              />
            ) : (
              <textarea
                id={id}
                name={f.key}
                required={f.required}
                maxLength={3000}
                rows={f.key === "details" ? 5 : 2}
                value={fields[f.key]}
                onChange={(e) => change(f.key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
