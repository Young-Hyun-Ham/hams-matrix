import type {
  Artifact,
  ArtifactKind,
  ArtifactStructure,
  TableColumn,
  TableOperation,
} from "./artifact-types";
import { HttpError } from "./auth";
import { validateTopology } from "./architecture";
const fail = (message: string): never => {
  throw new HttpError(400, message);
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, label: string, max = 200) => {
  if (typeof value !== "string" || value.length > max)
    fail(`${label} 항목을 확인해 주세요.`);
  return value as string;
};
const ids = (value: unknown, label: string) => {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 200 ||
    value.some((v) => typeof v !== "string" || v.length > 100)
  )
    fail(`${label} 항목을 확인해 주세요.`);
  return [...new Set(value as string[])];
};
export function references(
  a: Artifact,
): { targetId: string; relation: string }[] {
  const result = a.links.map((targetId) => ({
    targetId,
    relation: "reference",
  }));
  if (a.structure?.parentId)
    result.push({ targetId: a.structure.parentId, relation: "wbs_parent" });
  for (const targetId of a.structure?.dependencies ?? [])
    result.push({ targetId, relation: "wbs_dependency" });
  for (const c of a.structure?.columns ?? [])
    if (c.reference && c.reference.tableId !== a.id)
      result.push({ targetId: c.reference.tableId, relation: "foreign_key" });
  for (const op of a.structure?.tableOperations ?? [])
    result.push({ targetId: op.tableId, relation: "table_operation" });
  return result.filter(
    (r, i, list) =>
      list.findIndex(
        (x) => x.targetId === r.targetId && x.relation === r.relation,
      ) === i,
  );
}
export function versionClosure(artifacts: Artifact[], roots: string[]) {
  const byId = new Map(artifacts.map((a) => [a.id, a])),
    seen = new Set<string>(),
    queue = [...roots];
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    const a = byId.get(id);
    if (!a) continue;
    seen.add(id);
    queue.push(
      ...a.links,
      ...(a.structure?.tableOperations ?? []).map((op) => op.tableId),
      ...(a.structure?.columns ?? []).flatMap((c) =>
        c.reference ? [c.reference.tableId] : [],
      ),
    );
  }
  return [...seen]
    .sort()
    .map((id) => ({ artifactId: id, version: byId.get(id)!.version }));
}
export function prepareStructure(
  after: Artifact,
  input: Record<string, unknown>,
  artifacts: Artifact[],
  previous?: ArtifactStructure,
): ArtifactStructure {
  const raw = record(input.structure),
    structure: ArtifactStructure = {};
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const get = (id: string, kind: ArtifactKind) => {
    const a = byId.get(id);
    if (!a || a.kind !== kind)
      fail("같은 프로젝트의 유효한 연결 대상을 선택해 주세요.");
    return a!;
  };
  if (after.kind === "architecture") {
    const topology = raw.topology === undefined ? previous?.topology : raw.topology;
    if (topology !== undefined) {
      try { structure.topology = validateTopology(topology); }
      catch (error) { fail(error instanceof Error ? error.message : "아키텍처 구성도를 확인해 주세요."); }
    }
  }
  if (after.kind === "wbs") {
    structure.parentId = raw.parentId
      ? text(raw.parentId, "상위 작업", 100)
      : "";
    structure.dependencies = ids(raw.dependencies, "선행 작업");
    if (structure.parentId) {
      if (structure.parentId === after.id)
        fail("자기 자신을 상위 작업으로 지정할 수 없습니다.");
      if (get(structure.parentId, "wbs").fields.taskType !== "요약")
        fail("상위 작업은 요약 작업이어야 합니다.");
    }
    for (const id of structure.dependencies) {
      if (id === after.id)
        fail("자기 자신을 선행 작업으로 지정할 수 없습니다.");
      if (get(id, "wbs").fields.taskType === "요약")
        fail("선행 작업은 실제 작업 또는 마일스톤을 선택해 주세요.");
    }
    const f = after.fields;
    if (f.endDate < f.startDate) fail("계획 종료일은 시작일 이후여야 합니다.");
    if (Number(f.progress) < 0 || Number(f.progress) > 100)
      fail("진척률은 0~100입니다.");
    if (f.actualEnd && !f.actualStart)
      fail("실제 종료일을 입력하려면 실제 시작일이 필요합니다.");
    if (f.actualStart && f.actualEnd && f.actualEnd < f.actualStart)
      fail("실제 종료일은 실제 시작일 이후여야 합니다.");
    if (
      f.taskType === "마일스톤" &&
      (f.startDate !== f.endDate ||
        Number(f.plannedEffort) !== 0 ||
        ![0, 100].includes(Number(f.progress)))
    )
      fail(
        "마일스톤은 계획 시작/종료일이 같고 계획 공수는 0, 진척률은 0 또는 100이어야 합니다.",
      );
    if (
      f.taskType !== "요약" &&
      after.status === "완료" &&
      Number(f.progress) !== 100
    )
      fail("완료 작업의 진척률은 100이어야 합니다.");
    if (
      f.taskType === "요약" &&
      (after.links.length || structure.dependencies.length)
    )
      fail("산출물은 요약 작업의 하위 실제 작업에 배정해 주세요.");
  }
  if (after.kind === "database") {
    if (!/^[\p{L}_][\p{L}\p{N}_$]*$/u.test(after.fields.physicalName))
      fail("물리 테이블명을 확인해 주세요.");
    if (
      artifacts.some(
        (a) =>
          a.id !== after.id &&
          a.kind === "database" &&
          a.fields.physicalName.toLowerCase() ===
            after.fields.physicalName.toLowerCase() &&
          (a.fields.schema ?? "").toLowerCase() ===
            (after.fields.schema ?? "").toLowerCase(),
      )
    )
      fail("같은 스키마에 동일한 테이블명이 있습니다.");
    if (
      !Array.isArray(raw.columns) ||
      raw.columns.length < 1 ||
      raw.columns.length > 100
    )
      fail("컬럼을 1~100개 등록해 주세요.");
    const seen = new Set<string>(),
      columnIds = new Set<string>();
    structure.columns = (raw.columns as unknown[]).map((value) => {
      const r = record(value),
        id = text(r.id, "컬럼 ID", 100),
        name = text(r.name, "컬럼명", 100).trim(),
        dataType = text(r.dataType, "자료형", 80).trim();
      if (
        !id ||
        columnIds.has(id) ||
        !name ||
        !dataType ||
        seen.has(name.toLowerCase()) ||
        !/^[\p{L}_][\p{L}\p{N}_$]*$/u.test(name)
      )
        fail("컬럼 ID·이름은 중복 없이 입력하고 자료형을 지정해 주세요.");
      seen.add(name.toLowerCase());
      columnIds.add(id);
      for (const flag of ["nullable", "primaryKey", "unique"])
        if (typeof r[flag] !== "boolean")
          fail("컬럼의 NULL/PK/UNIQUE 값을 확인해 주세요.");
      if (r.primaryKey && r.nullable)
        fail("PK 컬럼은 NULL을 허용할 수 없습니다.");
      const column: TableColumn = {
        id,
        name,
        dataType,
        length: text(r.length ?? "", "길이", 40),
        description: text(r.description ?? "", "컬럼 설명", 1000),
        defaultValue: text(r.defaultValue ?? "", "기본값", 200),
        nullable: r.nullable as boolean,
        primaryKey: r.primaryKey as boolean,
        unique: r.unique as boolean,
      };
      if (r.reference) {
        const ref = record(r.reference);
        column.reference = {
          tableId: text(ref.tableId, "참조 테이블", 100),
          columnId: text(ref.columnId, "참조 컬럼", 100),
        };
        get(
          column.reference.tableId === after.id
            ? after.id
            : column.reference.tableId,
          "database",
        );
      }
      return column;
    });
  }
  if (after.kind === "program") {
    if (
      raw.tableOperations !== undefined &&
      !Array.isArray(raw.tableOperations)
    )
      fail("테이블 CRUD를 확인해 주세요.");
    const list = (raw.tableOperations ?? []) as unknown[];
    if (list.length > 100) fail("테이블 CRUD는 최대 100개입니다.");
    const seen = new Set<string>();
    structure.tableOperations = list.map((value) => {
      const r = record(value),
        tableId = text(r.tableId, "테이블", 100);
      get(tableId, "database");
      if (seen.has(tableId))
        fail("동일 테이블의 CRUD는 한 행에 지정해 주세요.");
      seen.add(tableId);
      const operations = ids(r.operations, "CRUD");
      if (
        !operations.length ||
        operations.some((op) => !["C", "R", "U", "D"].includes(op))
      )
        fail("CRUD를 한 개 이상 선택해 주세요.");
      return { tableId, operations } as TableOperation;
    });
    if (["준수", "예외 승인"].includes(after.fields.architectureCompliance)) {
      const architecture = after.links
        .map((id) => byId.get(id)!)
        .filter((a) => a.kind === "architecture");
      if (
        !architecture.length ||
        architecture.some((a) => !["승인", "완료"].includes(a.status))
      )
        fail("기술 검토를 완료하려면 승인된 아키텍처를 연결해 주세요.");
      if (
        !after.fields.reviewer ||
        !after.fields.reviewNotes ||
        input.confirmReview !== true
      )
        fail(
          "기술 검토자와 근거를 입력하고 현재 아키텍처 버전의 검토 완료를 확인해 주세요.",
        );
      structure.baselines = architecture.map((a) => ({
        artifactId: a.id,
        version: a.version,
      }));
    }
  }
  if (after.kind === "test" && after.fields.result !== "미실행") {
    for (const key of ["actual", "executedAt", "reviewer"])
      if (!after.fields[key])
        fail("검증 실행 결과·검증일·검증자를 입력해 주세요.");
    if (
      !after.links.some((id) =>
        ["program", "requirement"].includes(byId.get(id)?.kind ?? ""),
      )
    )
      fail("검증할 요구사항 또는 프로그램을 연결해 주세요.");
    if (after.fields.result === "통과" && !after.fields.evidence)
      fail("통과 결과에는 증빙 위치가 필요합니다.");
    if (input.confirmExecution !== true)
      fail("현재 연결 문서의 버전으로 검증한 결과인지 확인해 주세요.");
    structure.baselines = versionClosure(artifacts, after.links);
  }
  return structure;
}
export function validateProjectGraph(artifacts: Artifact[]) {
  const byId = new Map(artifacts.map((a) => [a.id, a])),
    wbs = artifacts.filter((a) => a.kind === "wbs");
  const visit = (
    id: string,
    path: Set<string>,
    seen: Set<string>,
    next: (a: Artifact) => string[],
  ) => {
    if (path.has(id)) fail("WBS 상위/선행 관계에 순환이 있습니다.");
    if (seen.has(id)) return;
    path.add(id);
    for (const target of next(byId.get(id)!)) visit(target, path, seen, next);
    path.delete(id);
    seen.add(id);
  };
  for (const next of [
    (a: Artifact) => (a.structure?.parentId ? [a.structure.parentId] : []),
    (a: Artifact) => a.structure?.dependencies ?? [],
  ]) {
    const seen = new Set<string>();
    for (const a of wbs) visit(a.id, new Set(), seen, next);
  }
  for (const a of wbs) {
    const parent = a.structure?.parentId
      ? byId.get(a.structure.parentId)
      : undefined;
    if (
      parent &&
      (parent.fields.taskType !== "요약" ||
        a.fields.startDate < parent.fields.startDate ||
        a.fields.endDate > parent.fields.endDate)
    )
      fail("하위 작업의 계획 기간은 상위 요약 작업의 기간 안에 있어야 합니다.");
    for (const id of a.structure?.dependencies ?? []) {
      const predecessor = byId.get(id)!;
      if (
        predecessor.fields.taskType === "요약" ||
        predecessor.fields.endDate > a.fields.startDate
      )
        fail("후속 작업은 선행 작업의 계획 종료일 이후에 시작해야 합니다.");
    }
  }
  for (const table of artifacts.filter((a) => a.kind === "database"))
    for (const column of table.structure?.columns ?? []) {
      if (!column.reference) continue;
      const target = byId.get(column.reference.tableId),
        targetColumn = target?.structure?.columns?.find(
          (c) => c.id === column.reference!.columnId,
        );
      if (!target || target.kind !== "database" || !targetColumn)
        fail(
          "FK에서 참조 중인 테이블/컬럼을 삭제하거나 연결할 수 없습니다. 참조를 먼저 해제해 주세요.",
        );
      const primary =
        target!.structure?.columns?.filter((c) => c.primaryKey) ?? [];
      if (
        !targetColumn!.unique &&
        !(targetColumn!.primaryKey && primary.length === 1)
      )
        fail(
          "단일 컬럼 FK는 단일 PK 또는 UNIQUE 컬럼을 참조해야 합니다. 복합키 관계는 제약조건에 기술해 주세요.",
        );
      if (
        column.dataType.trim().toUpperCase() !==
          targetColumn!.dataType.trim().toUpperCase() ||
        column.length !== targetColumn!.length
      )
        fail("FK 컬럼의 자료형과 길이는 참조 컬럼과 같아야 합니다.");
    }
}
