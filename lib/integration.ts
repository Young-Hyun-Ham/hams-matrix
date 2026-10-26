import type { Artifact, Baseline } from "./artifact-types";
export function referencesFor(a: Artifact) {
  return [
    ...new Set([
      ...a.links,
      ...(a.structure?.parentId ? [a.structure.parentId] : []),
      ...(a.structure?.dependencies ?? []),
      ...(a.structure?.columns ?? []).flatMap((c) =>
        c.reference && c.reference.tableId !== a.id
          ? [c.reference.tableId]
          : [],
      ),
      ...(a.structure?.tableOperations ?? []).map((op) => op.tableId),
    ]),
  ];
}
export function upstreamArtifacts(artifacts: Artifact[], root: Artifact) {
  const byId = new Map(artifacts.map((a) => [a.id, a])),
    seen = new Set<string>(),
    queue = [root.id];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    const a = byId.get(id);
    if (!a) continue;
    seen.add(id);
    queue.push(
      ...a.links.filter(
        (id) =>
          a.kind !== "requirement" || byId.get(id)?.kind !== "requirement",
      ),
      ...(a.structure?.tableOperations ?? []).map((op) => op.tableId),
      ...(a.structure?.columns ?? []).flatMap((c) =>
        c.reference ? [c.reference.tableId] : [],
      ),
    );
  }
  return artifacts.filter((a) => seen.has(a.id));
}
export function baselineCurrent(
  artifacts: Artifact[],
  baselines: Baseline[] | undefined,
  roots: Artifact[] = [],
) {
  if (!baselines?.length) return false;
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  if (!baselines.every((b) => byId.get(b.artifactId)?.version === b.version))
    return false;
  const ids = new Set(baselines.map((b) => b.artifactId));
  return roots.every((root) =>
    upstreamArtifacts(artifacts, root).every((a) => ids.has(a.id)),
  );
}
export function taskMetrics(artifacts: Artifact[], task?: Artifact) {
  const wbs = artifacts.filter((a) => a.kind === "wbs");
  const selected: Artifact[] = [];
  const seen = new Set<string>();
  const walk = (a: Artifact) => {
    if (seen.has(a.id)) return;
    seen.add(a.id);
    const children = wbs.filter((c) => c.structure?.parentId === a.id);
    if (a.fields.taskType === "요약") {
      children.forEach(walk);
    } else selected.push(a);
  };
  if (task) walk(task);
  else wbs.filter((a) => !a.structure?.parentId).forEach(walk);
  const weight = selected.reduce(
    (n, a) => n + (Number(a.fields.plannedEffort) || 1),
    0,
  );
  return {
    progress: weight
      ? Math.round(
          selected.reduce(
            (n, a) =>
              n +
              Number(a.fields.progress || 0) *
                (Number(a.fields.plannedEffort) || 1),
            0,
          ) / weight,
        )
      : 0,
    plannedEffort: selected.reduce(
      (n, a) => n + Number(a.fields.plannedEffort || 0),
      0,
    ),
    actualEffort: selected.reduce(
      (n, a) => n + Number(a.fields.actualEffort || 0),
      0,
    ),
    tasks: selected.length,
  };
}
export type AcceptanceIssue = {
  code: string;
  artifactId?: string;
  message: string;
};
export function acceptanceReport(
  artifacts: Artifact[],
  today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  ),
) {
  const issues: AcceptanceIssue[] = [],
    wbs = artifacts.filter((a) => a.kind === "wbs"),
    architectures = artifacts.filter((a) => a.kind === "architecture"),
    requirements = artifacts.filter((a) => a.kind === "requirement");
  const issue = (a: Artifact | undefined, message: string) => {
    if (!issues.some((i) => i.artifactId === a?.id && i.message === message))
      issues.push({ code: a?.code ?? "프로젝트", artifactId: a?.id, message });
  };
  const approved = (a: Artifact) => ["승인", "완료"].includes(a.status);
  if (!wbs.length) issue(undefined, "WBS가 없습니다.");
  if (!architectures.length) issue(undefined, "아키텍처 정의서가 없습니다.");
  if (!requirements.length) issue(undefined, "요구사항 정의서가 없습니다.");
  for (const a of artifacts) {
    if (a.kind === "wbs") {
      if (
        a.fields.taskType !== "요약" &&
        (a.status !== "완료" || Number(a.fields.progress) !== 100)
      )
        issue(
          a,
          a.fields.endDate < today
            ? "계획 종료일이 지난 미완료 작업입니다."
            : "작업이 완료되지 않았습니다.",
        );
      if (
        a.fields.taskType !== "요약" &&
        a.status === "완료" &&
        (!a.fields.actualStart || !a.fields.actualEnd)
      )
        issue(a, "완료 작업의 실제 시작일/종료일이 없습니다.");
      if (
        a.fields.taskType === "요약" &&
        !wbs.some((t) => t.structure?.parentId === a.id)
      )
        issue(a, "하위 작업이 없는 요약 작업입니다.");
      continue;
    }
    if (
      !wbs.some((t) => t.fields.taskType !== "요약" && t.links.includes(a.id))
    )
      issue(a, "문서를 작성/개발/검증할 WBS 작업이 배정되지 않았습니다.");
    if (a.kind === "architecture" && !approved(a))
      issue(a, "아키텍처가 승인되지 않았습니다.");
    if (["screen", "database"].includes(a.kind) && !approved(a))
      issue(a, "설계 문서가 승인되지 않았습니다.");
    if (
      a.kind === "screen" &&
      !a.links.some(
        (id) => artifacts.find((x) => x.id === id)?.kind === "requirement",
      )
    )
      issue(a, "화면의 원본 요구사항이 연결되지 않았습니다.");
    if (
      a.kind === "database" &&
      !a.links.some(
        (id) => artifacts.find((x) => x.id === id)?.kind === "requirement",
      ) &&
      !artifacts.some(
        (screen) =>
          screen.kind === "screen" &&
          screen.links.includes(a.id) &&
          screen.links.some(
            (id) => artifacts.find((x) => x.id === id)?.kind === "requirement",
          ),
      )
    )
      issue(a, "테이블의 원본 요구사항이 연결되지 않았습니다.");
    if (a.kind === "program") {
      if (a.status !== "완료") issue(a, "프로그램 구현이 완료되지 않았습니다.");
      if (
        !upstreamArtifacts(artifacts, a).some((x) => x.kind === "requirement")
      )
        issue(a, "프로그램의 원본 요구사항이 연결되지 않았습니다.");
      for (const id of a.links.filter(
        (id) => artifacts.find((x) => x.id === id)?.kind === "database",
      ))
        if (!a.structure?.tableOperations?.some((op) => op.tableId === id))
          issue(a, "연결한 테이블의 CRUD가 지정되지 않았습니다.");
      const linkedArchitectures = architectures.filter((arc) =>
        a.links.includes(arc.id),
      );
      if (!linkedArchitectures.length)
        issue(a, "적용 아키텍처가 연결되지 않았습니다.");
      if (
        !["준수", "예외 승인"].includes(a.fields.architectureCompliance) ||
        !baselineCurrent(artifacts, a.structure?.baselines)
      )
        issue(a, "현재 아키텍처 버전의 기술 준수 검토가 필요합니다.");
      if (linkedArchitectures.some((arc) => !approved(arc)))
        issue(a, "연결한 아키텍처가 승인되지 않았습니다.");
    }
    if (a.kind === "test") {
      const current = baselineCurrent(
        artifacts,
        a.structure?.baselines,
        a.links
          .map((id) => artifacts.find((x) => x.id === id))
          .filter((x): x is Artifact => !!x),
      );
      if (a.fields.result !== "통과" || !approved(a))
        issue(a, "검증 결과가 승인된 통과 상태가 아닙니다.");
      else if (!current)
        issue(a, "검증 이후 연결 문서가 변경되어 재검증이 필요합니다.");
    }
  }
  const rows = requirements.map((r) => {
    const upstream = (a: Artifact) =>
      upstreamArtifacts(artifacts, a).some((x) => x.id === r.id);
    const screens = artifacts.filter(
      (a) => a.kind === "screen" && a.links.includes(r.id),
    );
    const databases = artifacts.filter(
      (a) =>
        a.kind === "database" &&
        (a.links.includes(r.id) || screens.some((s) => s.links.includes(a.id))),
    );
    const programs = artifacts.filter(
      (a) => a.kind === "program" && upstream(a),
    );
    const tests = artifacts.filter((a) => a.kind === "test" && upstream(a));
    const validTests = tests.filter(
      (a) =>
        a.fields.result === "통과" &&
        approved(a) &&
        baselineCurrent(
          artifacts,
          a.structure?.baselines,
          a.links
            .map((id) => artifacts.find((x) => x.id === id))
            .filter((x): x is Artifact => !!x),
        ),
    );
    if (!approved(r)) issue(r, "요구사항 범위가 승인되지 않았습니다.");
    if (!r.fields.acceptance?.trim()) issue(r, "검수 기준이 없습니다.");
    if (
      (r.fields.needsScreen ??
        (r.fields.category === "SFR" ? "필요" : "해당 없음")) === "필요" &&
      !screens.length
    )
      issue(r, "필요한 화면 설계가 연결되지 않았습니다.");
    if (r.fields.needsDatabase === "필요") {
      if (!databases.length) issue(r, "필요한 DB 설계가 연결되지 않았습니다.");
      for (const d of databases)
        if (
          !programs.some((p) =>
            p.structure?.tableOperations?.some((op) => op.tableId === d.id),
          )
        )
          issue(d, "요구사항의 데이터 구조를 처리할 프로그램 CRUD가 없습니다.");
    }
    if (!programs.length) issue(r, "구현 프로그램이 연결되지 않았습니다.");
    if (!validTests.length)
      issue(r, "현재 버전에 대한 승인된 검증 통과 결과가 없습니다.");
    const linked = [r, ...screens, ...databases, ...programs, ...tests];
    const tasks = wbs.filter(
      (t) =>
        t.fields.taskType !== "요약" &&
        t.links.some((id) => linked.some((a) => a.id === id)),
    );
    const programTasks = wbs.filter(
      (t) =>
        t.fields.phase === "개발" &&
        t.fields.taskType !== "요약" &&
        t.links.some((id) => programs.some((a) => a.id === id)),
    );
    for (const p of programs) {
      if (!programTasks.some((t) => t.links.includes(p.id)))
        issue(p, "개발 단계의 WBS 작업이 없습니다.");
      if (
        !validTests.some((t) =>
          t.structure?.baselines?.some((b) => b.artifactId === p.id),
        )
      )
        issue(p, "현재 버전의 프로그램을 검증한 통과 결과가 없습니다.");
    }
    const arches = architectures.filter((arc) =>
      linked.some((a) =>
        upstreamArtifacts(artifacts, a).some((x) => x.id === arc.id),
      ),
    );
    return {
      requirement: r,
      screens,
      databases,
      programs,
      tests,
      tasks,
      architectures: arches,
      validTests,
    };
  });
  const requirementRows = rows.map((row) => {
    const ids = new Set([
      row.requirement.id,
      ...row.screens.map((a) => a.id),
      ...row.databases.map((a) => a.id),
      ...row.programs.map((a) => a.id),
      ...row.tests.map((a) => a.id),
      ...row.tasks.map((a) => a.id),
      ...row.architectures.map((a) => a.id),
    ]);
    const rowIssues = issues.filter(
      (i) => !i.artifactId || ids.has(i.artifactId),
    );
    return { ...row, issues: rowIssues, ready: rowIssues.length === 0 };
  });
  return {
    issues,
    requirements: requirementRows,
    ready: requirements.length > 0 && issues.length === 0,
    metrics: taskMetrics(artifacts),
    passed: requirementRows.filter((r) => r.ready).length,
    total: requirements.length,
    today,
  };
}
