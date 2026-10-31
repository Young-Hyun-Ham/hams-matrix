import type { Artifact } from "./artifact-types";
export type WbsPublication = {
  id: string; sequence: number; sourceHash: string; authorName: string; createdAt: string;
  snapshot: { project: { id: string; name: string }; artifacts: Artifact[] };
};
export function scheduleVersions(artifacts: Artifact[]) {
  return Object.fromEntries(artifacts.filter((artifact) => artifact.kind === "wbs")
    .sort((a, b) => a.id.localeCompare(b.id)).map((artifact) => [artifact.id, artifact.version]));
}
import { taskMetrics } from "./integration";

// Calendar dates are UTC-based day numbers, never instants converted to local time.
export function scheduleDay(value: string) {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value)
    throw new Error("올바른 날짜를 선택해 주세요.");
  return Math.round(time / 86400000);
}
export function scheduleDate(day: number) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}
export function koreaToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function aggregateSchedule(artifacts: Artifact[]) {
  const wbs = artifacts.filter((artifact) => artifact.kind === "wbs");
  const byId = new Map(wbs.map((artifact) => [artifact.id, artifact]));
  const done = new Map<string, Artifact>();
  const visiting = new Set<string>();
  function visit(artifact: Artifact): Artifact {
    if (done.has(artifact.id)) return done.get(artifact.id)!;
    if (visiting.has(artifact.id)) throw new Error("상위 작업에 순환이 있습니다.");
    visiting.add(artifact.id);
    const children = wbs.filter((child) => child.structure?.parentId === artifact.id).map(visit);
    let result = artifact;
    if (artifact.fields.taskType === "요약" && children.length) {
      const metrics = taskMetrics(wbs, artifact);
      result = { ...artifact, fields: { ...artifact.fields,
        startDate: children.map((child) => child.fields.startDate).sort()[0],
        endDate: children.map((child) => child.fields.endDate).sort().at(-1)!,
        progress: String(metrics.progress), plannedEffort: String(metrics.plannedEffort), actualEffort: String(metrics.actualEffort),
      } };
    }
    visiting.delete(artifact.id);
    done.set(artifact.id, result);
    return result;
  }
  for (const artifact of byId.values()) visit(artifact);
  return artifacts.map((artifact) => done.get(artifact.id) ?? artifact);
}
export function scheduleContent(artifact: Artifact) {
  return JSON.stringify({ title: artifact.title, status: artifact.status, fields: artifact.fields, links: artifact.links, structure: artifact.structure ?? {} });
}
