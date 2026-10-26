import assert from "node:assert/strict";
export async function checkIntegrated({
  request,
  client,
  cookie,
  user,
  otherCookie,
}) {
  const makeProject = async (name) => {
    const r = await request("/api/projects", {
      cookie,
      method: "POST",
      data: { name, description: "통합 산출물 검증", memberIds: [] },
    });
    assert.equal(r.status, 201, await r.clone().text());
    return (await r.json()).project;
  };
  const project = await makeProject("통합 검수 프로젝트"),
    foreign = await makeProject("다른 프로젝트");
  const base = `/api/projects/${project.id}/artifacts`;
  const call = (method, data, id) =>
    request(base + (id ? `/${id}` : ""), { cookie, method, data });
  const create = async (data) => {
    const r = await call("POST", data);
    assert.equal(r.status, 201, await r.clone().text());
    return (await r.json()).artifact;
  };
  const update = async (a, patch) => {
    const r = await call("PATCH", { ...a, ...patch, version: a.version }, a.id);
    assert.equal(r.status, 200, await r.clone().text());
    return (await r.json()).artifact;
  };
  const stats = async () => {
    const data = await (await request("/api/projects", { cookie })).json();
    return data.projects.find((p) => p.id === project.id).stats;
  };
  const arc = await create({
    kind: "architecture",
    title: "시스템 기술 표준",
    status: "승인",
    fields: {
      definition: "웹 시스템",
      frameworks: "React / Spring",
      database: "PostgreSQL",
      servers: "WAS / DB",
      security: "인증·권한",
      performance: "응답시간 기준",
      standards: "개발 표준",
    },
    links: [],
  });
  const req = await create({
    kind: "requirement",
    title: "고객 관리",
    status: "승인",
    fields: {
      category: "SFR",
      definition: "고객 관리",
      details: "조회 및 등록",
      acceptance: "정상 입력 저장, 잘못된 입력 차단",
      needsScreen: "필요",
      needsDatabase: "필요",
    },
    links: [arc.id],
  });
  const column = (id, name, pk = false, reference) => ({
    id,
    name,
    dataType: "BIGINT",
    length: "",
    description: name,
    nullable: !pk,
    primaryKey: pk,
    unique: false,
    defaultValue: "",
    ...(reference ? { reference } : {}),
  });
  let table = await create({
    kind: "database",
    title: "고객 테이블",
    status: "승인",
    fields: {
      definition: "고객 저장",
      physicalName: "customers",
      logicalName: "고객",
    },
    structure: { columns: [column("customer-id", "id", true)] },
    links: [req.id, arc.id],
  });
  let orders = await create({
    kind: "database",
    title: "주문 테이블",
    status: "승인",
    fields: {
      definition: "주문 저장",
      physicalName: "orders",
      logicalName: "주문",
    },
    structure: {
      columns: [
        column("order-id", "id", true),
        column("order-customer", "customer_id", false, {
          tableId: table.id,
          columnId: "customer-id",
        }),
      ],
    },
    links: [req.id],
  });
  assert.equal(
    (
      await call("POST", {
        kind: "database",
        title: "중복 물리명",
        status: "초안",
        fields: table.fields,
        structure: table.structure,
        links: [],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "PATCH",
        { ...table, structure: { columns: [] }, version: table.version },
        table.id,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "PATCH",
        {
          ...table,
          structure: { columns: [column("changed-id", "id", true)] },
          version: table.version,
        },
        table.id,
      )
    ).status,
    400,
  );
  const screen = await create({
    kind: "screen",
    title: "고객 화면",
    status: "승인",
    fields: { definition: "고객 화면", details: "등록 / 조회" },
    links: [req.id, table.id, orders.id],
  });
  let program = await create({
    kind: "program",
    title: "고객 API",
    status: "완료",
    fields: {
      definition: "고객 API",
      details: "입력 검사 후 저장",
      architectureCompliance: "준수",
      reviewer: "기술 검토자",
      reviewNotes: "승인된 표준 검토",
    },
    links: [arc.id, screen.id],
    structure: {
      tableOperations: [
        { tableId: table.id, operations: ["C", "R"] },
        { tableId: orders.id, operations: ["R"] },
      ],
    },
    confirmReview: true,
  });
  assert.equal(
    (
      await call("POST", {
        kind: "program",
        title: "잘못된 CRUD",
        status: "초안",
        fields: { definition: "API", details: "API" },
        links: [],
        structure: {
          tableOperations: [{ tableId: table.id, operations: ["X"] }],
        },
      })
    ).status,
    400,
  );
  const foreignResponse = await request(
    `/api/projects/${foreign.id}/artifacts`,
    {
      cookie,
      method: "POST",
      data: {
        kind: "database",
        title: "외부 테이블",
        status: "초안",
        fields: {
          definition: "외부",
          physicalName: "other",
          logicalName: "외부",
        },
        structure: { columns: [column("other-id", "id", true)] },
        links: [],
      },
    },
  );
  assert.equal(foreignResponse.status, 201);
  const foreignTable = (await foreignResponse.json()).artifact;
  assert.equal(
    (
      await call(
        "PATCH",
        {
          ...program,
          version: program.version,
          structure: {
            tableOperations: [{ tableId: foreignTable.id, operations: ["R"] }],
          },
          confirmReview: true,
        },
        program.id,
      )
    ).status,
    400,
  );
  const testInput = {
    kind: "test",
    title: "고객 등록 검증",
    status: "완료",
    fields: {
      testType: "인수",
      definition: "고객 저장 후 조회",
      expected: "입력 값과 조회 값 일치",
      actual: "일치 확인",
      result: "통과",
      evidence: "검증 결과 문서 #1",
      executedAt: "2026-10-20",
      reviewer: "검증 담당자",
    },
    links: [req.id, program.id],
  };
  assert.equal((await call("POST", testInput)).status, 400);
  let test = await create({ ...testInput, confirmExecution: true });
  assert.ok(test.structure.baselines.some((b) => b.artifactId === table.id));
  assert.ok(test.structure.baselines.some((b) => b.artifactId === arc.id));
  const root = await create({
    kind: "wbs",
    title: "프로젝트 전체",
    status: "초안",
    fields: {
      phase: "착수",
      taskType: "요약",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      plannedEffort: "0",
      actualEffort: "0",
      progress: "0",
      definition: "전체 일정",
    },
    links: [],
    structure: {},
  });
  const taskInput = {
    kind: "wbs",
    title: "문서 작성 및 개발·검증",
    status: "완료",
    fields: {
      phase: "개발",
      taskType: "작업",
      startDate: "2026-10-10",
      endDate: "2026-10-20",
      plannedEffort: "16",
      actualEffort: "18",
      progress: "100",
      actualStart: "2026-10-10",
      actualEnd: "2026-10-20",
      definition: "모든 산출물 작성 및 검증 완료",
    },
    links: [
      arc.id,
      req.id,
      table.id,
      orders.id,
      screen.id,
      program.id,
      test.id,
    ],
    structure: { parentId: root.id, dependencies: [] },
  };
  let task = await create(taskInput);
  let summary = await stats();
  assert.equal(summary.wbsProgress, 100);
  assert.equal(summary.plannedEffort, 16);
  assert.equal(summary.actualEffort, 18);
  assert.equal(summary.acceptanceReady, true);
  assert.equal(
    (
      await call(
        "PATCH",
        { ...root, version: root.version, structure: { parentId: root.id } },
        root.id,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "PATCH",
        {
          ...task,
          version: task.version,
          structure: { parentId: root.id, dependencies: [task.id] },
        },
        task.id,
      )
    ).status,
    400,
  );
  const secondSummary = await create({
    ...root,
    id: undefined,
    title: "하위 요약",
    structure: { parentId: root.id },
  });
  assert.equal(
    (
      await call(
        "PATCH",
        {
          ...root,
          version: root.version,
          structure: { parentId: secondSummary.id },
        },
        root.id,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call("POST", {
        ...taskInput,
        title: "잘못된 기간",
        fields: { ...taskInput.fields, startDate: "2026-02-30" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("POST", {
        ...taskInput,
        title: "범위 이탈",
        fields: { ...taskInput.fields, endDate: "2026-11-02" },
      })
    ).status,
    400,
  );
  const predecessor = await create({
    ...taskInput,
    title: "선행 마일스톤",
    fields: {
      ...taskInput.fields,
      taskType: "마일스톤",
      startDate: "2026-10-05",
      endDate: "2026-10-05",
      plannedEffort: "0",
      actualEffort: "0",
    },
    links: [],
    structure: { parentId: root.id },
  });
  task = await update(task, {
    structure: { parentId: root.id, dependencies: [predecessor.id] },
  });
  assert.equal(
    (
      await call(
        "PATCH",
        {
          ...predecessor,
          fields: {
            ...predecessor.fields,
            startDate: "2026-10-22",
            endDate: "2026-10-22",
          },
          version: predecessor.version,
        },
        predecessor.id,
      )
    ).status,
    400,
  );
  assert.equal(
    (await call("DELETE", { version: table.version }, table.id)).status,
    409,
  );
  const changedArc = await update(arc, {
    fields: { ...arc.fields, standards: "수정한 개발 표준" },
  });
  assert.equal((await stats()).acceptanceReady, false);
  program = await update(program, { confirmReview: true });
  test = await update(test, { confirmExecution: true });
  assert.ok(
    test.structure.baselines.some(
      (b) => b.artifactId === changedArc.id && b.version === changedArc.version,
    ),
  );
  const doc = await (await request(base, { cookie })).json();
  assert.ok(
    doc.artifacts
      .find((a) => a.id === task.id)
      .structure.dependencies.includes(predecessor.id),
  );
  // Remove an empty summary and verify typed references can be replaced without stale edges.
  assert.equal(
    (await call("DELETE", { version: secondSummary.version }, secondSummary.id))
      .status,
    409,
  );
  const clearedSummary = await update(secondSummary, {
    structure: { parentId: "", dependencies: [] },
  });
  assert.equal(
    (
      await call(
        "DELETE",
        { version: clearedSummary.version },
        clearedSummary.id,
      )
    ).status,
    200,
  );
  assert.equal((await stats()).acceptanceReady, true);
  orders = await update(orders, {
    structure: {
      columns: [
        column("order-id", "id", true),
        column("order-customer", "customer_id"),
      ],
    },
  });
  const references = await client.execute({
    sql: "SELECT * FROM artifact_links WHERE source_id=? AND relation='foreign_key'",
    args: [orders.id],
  });
  assert.equal(references.rows.length, 0);
  table = await update(table, {
    structure: { columns: [column("customer-id", "customer_key", true)] },
  });
  assert.equal((await stats()).acceptanceReady, false); // previously passed evidence must become stale.
  test = await update(test, { confirmExecution: true });
  assert.equal((await stats()).acceptanceReady, true);
  assert.equal((await request(base, { cookie: otherCookie })).status, 404);
  assert.equal(
    (
      await request(`/api/projects/${project.id}/export`, {
        cookie: otherCookie,
      })
    ).status,
    404,
  );
  const exported = await request(`/api/projects/${project.id}/export`, {
    cookie,
  });
  assert.equal(exported.status, 200);
  const content = Buffer.from(await exported.arrayBuffer()).toString();
  for (const text of [
    "WBS진척집계",
    "아키텍처정의서",
    "데이터베이스설계서",
    "테이블컬럼정의서",
    "프로그램테이블CRUD",
    "통합검수점검",
    "검증기준버전",
    "customer_key",
    req.code,
    table.code,
    program.code,
    task.code,
    test.code,
  ])
    assert.ok(content.includes(text), text);
  await client.execute({
    sql: "UPDATE workspace_members SET role='viewer' WHERE workspace_id=? AND user_id=?",
    args: [user.workspaceId, user.id],
  });
  assert.equal((await call("POST", taskInput)).status, 403);
  assert.equal(
    (await call("PATCH", { ...task, version: task.version }, task.id)).status,
    403,
  );
  assert.equal(
    (await call("DELETE", { version: task.version }, task.id)).status,
    403,
  );
  assert.equal((await request(base, { cookie })).status, 200);
  await client.execute({
    sql: "UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?",
    args: [user.role, user.workspaceId, user.id],
  });
  console.log(
    "PASS: integrated WBS hierarchy/dependencies/effort, architecture reviews, DB columns/FK integrity, typed CRUD, current-version verification, acceptance readiness, cross-project isolation and unified workbook.",
  );
}
