import { builderList, builderRequest } from "./transport";
import { useBuilderStore } from "../store";
const id = (value: any) => encodeURIComponent(String(value));
const path = (value: any) => "/scenarios/" + id(value);
const remember = (s: any): any => {
  const state = useBuilderStore.getState();
  if (state.scenario?.id === s.id)
    state.setScenario({ ...state.scenario, ...s });
  state.setScenarios(
    state.scenarios.map((x) => (x.id === s.id ? { ...x, ...s } : x)),
  );
  return s;
};
const expected = (value: any): number | undefined =>
  value?.revision ??
  useBuilderStore.getState().scenarios.find((x) => x.id === value?.id)
    ?.revision ??
  (useBuilderStore.getState().scenario?.id === value?.id
    ? useBuilderStore.getState().scenario.revision
    : undefined);
export async function fetchScenarios(options: any = {}) {
  const q = new URLSearchParams();
  for (const k of ["name", "scenario_type", "deployment", "period"])
    if (options[k]) q.set(k, options[k]);
  return builderList("/scenarios?" + q);
}
export async function fetchScenarioData(input: any) {
  const { scenario } = await builderRequest(
    path(typeof input === "string" ? input : input.scenarioId),
  );
  return scenario;
}
export async function createScenario(input: any) {
  const { scenario } = await builderRequest("/scenarios", "POST", input);
  return scenario;
}
export async function toggleScenarioCommand(
  scenarioId: string,
  enabled: boolean,
  expectedRevision: number,
) {
  const { scenario } = await builderRequest(
    path(scenarioId) + "/command",
    "PATCH",
    {
      enabled,
      expectedRevision,
    },
  );
  return remember(scenario) as {
    id: string;
    commandEnabled: boolean;
    revision: number;
  };
}
export async function patchScenario(input: any): Promise<any> {
  const { scenario } = await builderRequest(path(input.id), "PATCH", {
    ...input,
    expectedRevision: expected(input),
  });
  return remember(scenario);
}
export async function saveScenarioData({
  scenario: input,
  data,
}: any): Promise<any> {
  const publish = !!input.version_yn;
  const { scenario } = await builderRequest(
    path(input.id) + (publish ? "/versions" : ""),
    publish ? "POST" : "PATCH",
    {
      name: input.name,
      description: input.description,
      job: input.job,
      scenario_type: input.scenario_type,
      notes: input.notes,
      canvasMemos: input.canvasMemos,
      ...data,
      expectedRevision: expected(input),
      ...(publish ? { requestId: crypto.randomUUID() } : {}),
    },
  );
  return remember(scenario);
}
export async function deleteScenario(input: any) {
  const scenarioIds = Array.isArray(input) ? input : [input.scenarioId];
  const expectedRevisions = Object.fromEntries(
    scenarioIds.map((value: string) => [value, expected({ id: value })]),
  );
  return builderRequest("/scenarios/delete", "POST", {
    scenarioIds,
    expectedRevisions,
  });
}
export async function cloneScenario(p: any) {
  const value =
    p.clone_from_id ?? p.sourceScenarioId ?? p.scenarioToClone?.id ?? p.id;
  const { scenario } = await builderRequest(path(value) + "/clone", "POST", {
    newName: p.newName ?? p.name,
  });
  return scenario;
}
export const updateScenarioLastUsed = (p: any) =>
  builderRequest(path(p.scenarioId) + "/last-used", "POST");
export const getScenarioVersions = (p: any) =>
  builderRequest(path(p.scenario_id) + "/versions");
export async function getScenarioVersion(p: any) {
  if (!p.version_id) return fetchScenarioData(p.scenario_id);
  return (
    await builderRequest(path(p.scenario_id) + "/versions/" + id(p.version_id))
  ).scenario;
}
export const getScenarioDeployHistory = (p: any) =>
  builderRequest(
    path(p.scenario_id) +
      "/deployments?page=" +
      (p.page ?? 1) +
      "&pageSize=" +
      (p.pageSize ?? 50),
  );
export async function restoreScenarioVersion(p: any) {
  return remember(
    (
      await builderRequest(path(p.scenario_id) + "/restore", "POST", {
        versionNumber: p.version_id,
        expectedRevision: expected({ id: p.scenario_id }),
      })
    ).scenario,
  );
}
export async function scenarioVersionDeploy(p: any) {
  const value = p.snro_id ?? p.scenario_id;
  return remember(
    (
      await builderRequest(path(value) + "/deployments", "POST", {
        versionNumber: p.ver_id,
        memo: p.memo ?? "",
        expectedRevision: expected({ id: value }),
        requestId: crypto.randomUUID(),
      })
    ).scenario,
  );
}
const templates = (kind: string) => builderList("/templates?kind=" + kind);
async function saveTemplate(p: any, kind: string) {
  return (
    await builderRequest(
      "/templates" + (p.id ? "/" + id(p.id) : ""),
      p.id ? "PATCH" : "POST",
      {
        ...p,
        kind,
        name: p.name ?? p.title ?? "템플릿",
        expectedRevision: p.revision,
        content: p,
      },
    )
  ).template;
}
const removeTemplate = async (p: any) => {
  const value = typeof p === "string" ? p : p.id;
  const existing =
    typeof p === "string"
      ? (await builderRequest("/templates/" + id(value))).template
      : p;
  return builderRequest("/templates/" + id(value), "DELETE", {
    expectedRevision: existing.revision,
  });
};
export const fetchApiTemplates = (_p?: unknown) => {
  void _p;
  return templates("api");
};
export const fetchFormTemplates = (_p?: unknown) => {
  void _p;
  return templates("form");
};
export const saveApiTemplate = (p: any) => saveTemplate(p, "api");
export const saveFormTemplate = (p: any) => saveTemplate(p, "form");
export const deleteApiTemplate = removeTemplate;
export const deleteFormTemplate = removeTemplate;
