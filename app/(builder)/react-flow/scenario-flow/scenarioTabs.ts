import { getScenarioType } from "../../utils/scenarioTypes";
export type ScenarioTabKind = "unit" | "multi" | "sub";

export function getScenarioTabKind(
  scenario: Record<string, unknown>,
): ScenarioTabKind {
  const kind = getScenarioType(scenario);
  return kind === "agent" ? "unit" : kind;
}

export function getScenarioTabVersion(
  scenario: Record<string, unknown>,
): string {
  const version =
    scenario.ver_id ??
    scenario.versions ??
    scenario.ltst_ver_id ??
    scenario.latestVersion;
  if (
    version === 0 ||
    version === "0" ||
    version === undefined ||
    version === null ||
    String(version).trim() === ""
  )
    return "Draft";
  return `v.${String(version)
    .trim()
    .replace(/^v[.\s]*/i, "")}`;
}
