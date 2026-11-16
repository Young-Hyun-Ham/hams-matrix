import type { Artifact, ArtifactKind } from "./artifact-types";
import { upstreamArtifacts } from "./integration";
export type TraceRow = {
  requirement?: Artifact;
  screen?: Artifact;
  database?: Artifact;
  program?: Artifact;
  function?: Artifact;
  relation: string;
};
export function traceRows(artifacts: Artifact[]): TraceRow[] {
  const result: TraceRow[] = [],
    byId = new Map(artifacts.map((a) => [a.id, a])),
    programs = artifacts.filter((a) => a.kind === "program"),
    seen = new Set<string>();
  const tables = (p: Artifact) =>
    [
      ...new Set([
        ...p.links.filter((id) => byId.get(id)?.kind === "database"),
        ...(p.structure?.tableOperations ?? []).map((op) => op.tableId),
      ]),
    ]
      .map((id) => byId.get(id)!)
      .filter(Boolean);
  const push = (row: TraceRow) => {
    const key = [
      row.requirement?.id,
      row.screen?.id,
      row.database?.id,
      row.program?.id,
      row.function?.id,
    ].join(":");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(row);
    }
  };
  for (const requirement of artifacts.filter((a) => a.kind === "requirement")) {
    const screens = artifacts.filter(
      (a) => a.kind === "screen" && a.links.includes(requirement.id),
    );
    for (const screen of screens) {
      const linked = programs.filter((p) => p.links.includes(screen.id));
      const databases = screen.links
        .filter((id) => byId.get(id)?.kind === "database")
        .map((id) => byId.get(id)!);
      if (!linked.length && !databases.length)
        push({ requirement, screen, relation: "프로그램 미연결" });
      for (const program of linked) {
        const dbs = tables(program);
        if (!dbs.length)
          push({ requirement, screen, program, relation: "화면 경유" });
        for (const database of dbs)
          push({
            requirement,
            screen,
            database,
            program,
            relation: "화면 및 프로그램 DB 처리",
          });
      }
      for (const database of databases)
        if (!linked.some((p) => tables(p).some((d) => d.id === database.id)))
          push({
            requirement,
            screen,
            database,
            relation: "테이블 처리 프로그램 미연결",
          });
    }
    for (const database of artifacts.filter(
      (a) => a.kind === "database" && a.links.includes(requirement.id),
    )) {
      const linked = programs.filter((p) =>
        tables(p).some((t) => t.id === database.id),
      );
      if (!linked.length)
        push({
          requirement,
          database,
          relation: "데이터 처리 프로그램 미연결",
        });
      for (const program of linked)
        push({ requirement, database, program, relation: "DB 경유" });
    }
    for (const program of programs.filter((p) =>
      p.links.includes(requirement.id),
    )) {
      const dbs = tables(program);
      if (!dbs.length)
        push({ requirement, program, relation: "요구사항 직접 연결" });
      for (const database of dbs)
        push({
          requirement,
          database,
          program,
          relation: "요구사항 직접 연결 / DB 처리",
        });
    }
    for (const fn of artifacts.filter(
      (a) =>
        a.kind === "function" &&
        upstreamArtifacts(artifacts, a).some((r) => r.id === requirement.id),
    )) {
      const linked = programs.filter((p) => p.links.includes(fn.id));
      if (!linked.length)
        push({ requirement, function: fn, relation: "기능 / 프로그램 미연결" });
      for (const program of linked)
        push({ requirement, function: fn, program, relation: "기능 경유" });
    }
    if (!result.some((row) => row.requirement?.id === requirement.id))
      push({ requirement, relation: "설계 미연결" });
  }
  for (const a of artifacts.filter((a) =>
    ["screen", "database", "function", "program"].includes(a.kind),
  )) {
    if (
      result.some((row) =>
        [
          row.screen?.id,
          row.database?.id,
          row.function?.id,
          row.program?.id,
        ].includes(a.id),
      )
    )
      continue;
    if (a.kind === "screen") {
      const linked = programs.filter((p) => p.links.includes(a.id));
      if (!linked.length) push({ screen: a, relation: "요구사항 미연결" });
      for (const program of linked)
        push({ screen: a, program, relation: "요구사항 미연결" });
    }
    if (a.kind === "function") {
      const linked = programs.filter((p) => p.links.includes(a.id));
      if (!linked.length) push({ function: a, relation: "요구사항 미연결" });
      for (const program of linked)
        push({ function: a, program, relation: "요구사항 미연결 / 기능 경유" });
    }
    if (a.kind === "database")
      push({ database: a, relation: "요구사항 미연결" });
    if (a.kind === "program") push({ program: a, relation: "요구사항 미연결" });
  }
  return result;
}
export function relatedCodes(
  artifacts: Artifact[],
  item: Artifact,
  kind: ArtifactKind,
  rows = traceRows(artifacts),
) {
  const ids = new Set(
    artifacts
      .filter(
        (a) =>
          a.kind === kind &&
          (a.links.includes(item.id) || item.links.includes(a.id)),
      )
      .map((a) => a.id),
  );
  for (const row of rows) {
    if (
      [
        row.requirement,
        row.screen,
        row.database,
        row.function,
        row.program,
      ].some((a) => a?.id === item.id)
    ) {
      const a =
        kind === "requirement"
          ? row.requirement
          : kind === "screen"
            ? row.screen
            : kind === "database"
              ? row.database
              : kind === "function"
                ? row.function
                : kind === "program"
                  ? row.program
                  : undefined;
      if (a && a.id !== item.id) ids.add(a.id);
    }
  }
  if (["wbs", "architecture", "test"].includes(kind))
    for (const a of artifacts.filter((a) => a.kind === kind))
      if (
        upstreamArtifacts(artifacts, a).some((x) => x.id === item.id) ||
        upstreamArtifacts(artifacts, item).some((x) => x.id === a.id)
      )
        ids.add(a.id);
  return artifacts
    .filter((a) => ids.has(a.id))
    .map((a) => a.code)
    .join(", ");
}
