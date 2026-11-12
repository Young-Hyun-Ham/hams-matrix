import { kinds, type Artifact } from "./artifact-types";
import { acceptanceReport, baselineCurrent } from "./integration";
import type {
  DashboardArtifact,
  DashboardImpact,
  DashboardProject,
} from "./dashboard-types";

export function dashboardRange(now = new Date()) {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(now);
  const midnight = new Date(`${today}T00:00:00+09:00`).getTime();
  return {
    start: new Date(midnight - 6 * 86400000).toISOString(),
    end: new Date(midnight + 86400000).toISOString(),
    asOf: now.toISOString(),
    startDate: new Date(midnight - 6 * 86400000 + 9 * 3600000)
      .toISOString()
      .slice(0, 10),
    endDate: today,
  };
}

export function dashboardProjectStats(
  artifacts: Artifact[],
  complete: boolean,
  today: string,
) {
  const count = (kind: Artifact["kind"]) =>
    artifacts.filter((a) => a.kind === kind).length;
  const report = complete ? acceptanceReport(artifacts, today) : null;
  return {
    requirements: count("requirement"),
    screens: count("screen"),
    programs: count("program"),
    completed: artifacts.filter(
      (a) => a.kind === "requirement" && a.status === "완료",
    ).length,
    wbs: count("wbs"),
    architectures: count("architecture"),
    databases: count("database"),
    tests: count("test"),
    ...(report
      ? {
          wbsProgress: report.metrics.progress,
          plannedEffort: report.metrics.plannedEffort,
          actualEffort: report.metrics.actualEffort,
          acceptanceReady: report.ready,
          acceptanceIssues: report.issues.length,
        }
      : {}),
  };
}

export function dashboardPreview(
  projects: DashboardProject[],
  artifacts: Artifact[],
) {
  const byProject = new Map(projects.map((p) => [p.id, p]));
  const visible = artifacts.filter((a) =>
    byProject.get(a.projectId)?.readableTabs.includes(a.kind),
  );
  const recentArtifacts: DashboardArtifact[] = [...visible]
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
    )
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      projectId: a.projectId,
      projectName: byProject.get(a.projectId)!.name,
      kind: a.kind,
      code: a.code,
      title: a.title,
      version: a.version,
      status: a.status,
      owner: a.fields.owner?.trim() || "미지정",
      updatedAt: a.updatedAt,
    }));
  const limited = projects.some(
    (p) => !kinds.every((kind) => p.readableTabs.includes(kind)),
  );
  const candidates: {
    date: string;
    id: string;
    value: NonNullable<DashboardImpact["candidate"]>;
  }[] = [];
  for (const project of projects) {
    if (!project.completeScope) continue;
    const items = visible.filter((a) => a.projectId === project.id);
    const byId = new Map(items.map((a) => [a.id, a]));
    for (const test of items) {
      const baselines = test.structure?.baselines;
      if (
        test.kind !== "test" ||
        test.fields.result !== "통과" ||
        !["승인", "완료"].includes(test.status) ||
        !baselines?.length ||
        baselines.some((b) => !byId.has(b.artifactId)) ||
        baselineCurrent(items, baselines)
      )
        continue;
      for (const baseline of baselines) {
        const source = byId.get(baseline.artifactId)!;
        if (source.id === test.id || source.version === baseline.version)
          continue;
        candidates.push({
          date: [source.updatedAt, test.updatedAt].sort().at(-1)!,
          id: `${test.id}:${source.id}`,
          value: {
            projectId: project.id,
            projectName: project.name,
            source: {
              code: source.code,
              title: source.title,
              version: source.version,
            },
            test: { code: test.code, title: test.title, version: test.version },
            baselineVersion: baseline.version,
          },
        });
      }
    }
  }
  candidates.sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
  const impactPreview: DashboardImpact = candidates.length
    ? { state: "candidate", limited, candidate: candidates[0].value }
    : { state: limited ? "limited" : "none", limited };
  return {
    recentArtifacts,
    impactPreview,
    artifacts: visible.length,
    reviewing: visible.filter((a) => a.status === "검토 중").length,
  };
}
