import type { ScenarioType } from "../types/types";

export const SCENARIO_TYPE_OPTIONS = [
  { value: "agent", label: "Agent" },
  { value: "multi", label: "Multi" },
  { value: "sub", label: "Sub" },
] as const;

export function getScenarioType(
  scenario?: { scenario_type?: unknown; kind?: unknown; type?: unknown } | null,
): ScenarioType {
  const value = String(
    scenario?.scenario_type ?? scenario?.kind ?? scenario?.type ?? "sub",
  )
    .trim()
    .toLowerCase();
  return value === "unit"
    ? "agent"
    : value === "agent" || value === "multi"
      ? value
      : "sub";
}
