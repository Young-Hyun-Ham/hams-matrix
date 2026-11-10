import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkAiToolExecution({ load, client }) {
  const { generateAi } = load(resolve("lib/ai-server.ts"));
  const { validateGuardrailPolicy } = load(
    resolve("lib/ai/guardrail-policy.ts"),
  );
  const { defaultGuardrailPolicy } = load(resolve("lib/ai/guardrail-types.ts"));
  const { createPageAgent } = load(resolve("lib/ai/page-tools.ts"));
  const { aiPages } = load(resolve("lib/ai/page-prompts.ts"));
  const { db } = load(resolve("lib/db.ts"));
  assert.equal(validateGuardrailPolicy({ maxChanges: 100 }).maxToolRounds, 12);
  for (const maxToolRounds of [2, 12, 40])
    assert.equal(
      validateGuardrailPolicy({ maxToolRounds }).maxToolRounds,
      maxToolRounds,
    );
  for (const maxToolRounds of [1, 41, 2.5, "12", null])
    assert.throws(() => validateGuardrailPolicy({ maxToolRounds }), /2~40/);
  const user = {
    id: "owner",
    name: "Owner",
    workspaceId: "ws",
    role: "owner",
    accountRole: "user",
    onboardingComplete: true,
  };
  const makeAgent = (
    limit = 100,
    canWrite = true,
    prompt = "테이블을 등록해줘",
    checkpoint,
  ) =>
    createPageAgent(
      new Request("http://localhost/test"),
      user,
      { projectId: "project", tab: "database" },
      aiPages.database,
      canWrite,
      prompt,
      checkpoint,
      {
        policy: { ...defaultGuardrailPolicy, maxChanges: limit },
        inspect: async () => {},
      },
    );
  const table = (index) => ({
    clientRef: `t${index}`,
    title: `Batch ${index}`,
    fields: {
      definition: "Synthetic table",
      physicalName: `batch_table_${index}`,
      logicalName: `Table ${index}`,
    },
    structure: {
      columns: [
        {
          id: "id",
          logicalName: "identifier",
          name: "id",
          dataType: "INTEGER",
          nullable: false,
          primaryKey: true,
          unique: false,
        },
      ],
    },
  });
  const count = async () =>
    Number(
      (await client.execute("SELECT COUNT(*) AS count FROM project_artifacts"))
        .rows[0].count,
    );
  const before = await count(),
    agent = makeAgent();
  const items = Array.from({ length: 100 }, (_, i) => table(i));
  items[0].structure.columns.push({
    id: "parent",
    logicalName: "parent_identifier",
    name: "parent_id",
    dataType: "INTEGER",
    nullable: true,
    primaryKey: false,
    unique: false,
    reference: { tableId: "@t99", columnId: "id" },
  });
  const result = await agent.execute("save_database_tables", { items });
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.pendingCount, 100);
  assert.equal(result.remainingChanges, 0);
  assert.equal(await count(), before, "preview does not persist");
  assert.equal(
    (await agent.execute("save_artifact", { action: "CREATE", ...table(101) }))
      .success,
    false,
  );
  const tx = await db().transaction("write");
  try {
    const committed = await agent.commit(tx);
    assert.equal(committed.length, 100);
    const child = committed.find((item) => item.title === "Batch 0"),
      parent = committed.find((item) => item.title === "Batch 99");
    const row = (
      await tx.execute({
        sql: "SELECT structure_json FROM project_artifacts WHERE id=?",
        args: [child.id],
      })
    ).rows[0];
    assert.equal(
      JSON.parse(row.structure_json).columns[1].reference.tableId,
      parent.id,
    );
  } finally {
    await tx.rollback();
    tx.close();
  }
  assert.equal(await count(), before);
  const invalid = [table(201), table(202)];
  invalid[1].structure.columns[0].nullable = true;
  const invalidAgent = makeAgent();
  assert.equal(
    (await invalidAgent.execute("save_database_tables", { items: invalid }))
      .success,
    false,
  );
  assert.equal(invalidAgent.pendingCount(), 0);
  assert.equal(await count(), before, "failed batch fully rolls back");
  const cycle = table(203);
  cycle.structure.columns[0].reference = { tableId: "@t203", columnId: "id" };
  const cycleAgent = makeAgent();
  assert.equal(
    (await cycleAgent.execute("save_database_tables", { items: [cycle] }))
      .success,
    true,
  );
  const cyclic = [table(301), table(302)];
  cyclic[0].structure.columns[0].reference = {
    tableId: "@t302",
    columnId: "id",
  };
  cyclic[1].structure.columns[0].reference = {
    tableId: "@t301",
    columnId: "id",
  };
  assert.equal(
    (await cycleAgent.execute("save_database_tables", { items: cyclic }))
      .success,
    true,
  );
  const cycleTx = await db().transaction("write");
  try {
    const saved = await cycleAgent.commit(cycleTx);
    assert.equal(saved.length, 3);
    assert.ok(saved.every((item) => item.version === 1));
    const structure = JSON.parse(
      (
        await cycleTx.execute({
          sql: "SELECT structure_json FROM project_artifacts WHERE id=?",
          args: [saved[0].id],
        })
      ).rows[0].structure_json,
    );
    assert.equal(structure.columns[0].reference.tableId, saved[0].id);
    assert.deepEqual(
      (await cycleTx.execute("PRAGMA foreign_key_check")).rows,
      [],
    );
  } finally {
    await cycleTx.rollback();
    cycleTx.close();
  }
  const { GenerationCancelled } = load(resolve("lib/ai/generation-control.ts"));
  let checkpoints = 0;
  await assert.rejects(
    () =>
      makeAgent(100, true, "등록해줘", async () => {
        if (++checkpoints >= 4) throw new GenerationCancelled();
      }).execute("save_database_tables", { items: [table(401), table(402)] }),
    /중지/,
  );
  assert.equal(await count(), before, "cancellation rolls back batch");
  const missing = table(204);
  missing.structure.columns[0].reference = {
    tableId: "@missing",
    columnId: "id",
  };
  assert.equal(
    (await makeAgent().execute("save_database_tables", { items: [missing] }))
      .success,
    false,
  );
  assert.equal(
    (
      await makeAgent(1).execute("save_database_tables", {
        items: [table(1), table(2)],
      })
    ).success,
    false,
  );
  assert.equal(
    (
      await makeAgent(100, false).execute("save_database_tables", {
        items: [table(1)],
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await makeAgent(100, true, "설계 초안만 작성").execute(
        "save_database_tables",
        { items: [table(1)] },
      )
    ).status,
    403,
  );
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const tool = (name = "read_page") => ({
    type: "function_call",
    name,
    call_id: `call-${calls}`,
    arguments: "{}",
  });
  const answer = [
    { type: "message", content: [{ type: "output_text", text: "Done" }] },
  ];
  const mock = (output) => {
    globalThis.fetch = async (_, options) => {
      calls++;
      return Response.json({
        status: "completed",
        output: output(JSON.parse(options.body)),
      });
    };
  };
  const execute = async (options) =>
    generateAi(
      "gpt-5.6-sol",
      "Test",
      "Test",
      {
        tools: [{ name: "read_page" }],
        execute: async () => ({ success: true, data: calls }),
      },
      [],
      [],
      undefined,
      undefined,
      options,
    );
  try {
    mock(() => (calls < 9 ? [tool()] : answer));
    assert.equal(await execute(), "Done");
    assert.equal(calls, 9, "more than six rounds supported");
    calls = 0;
    mock((body) => {
      if (calls === 2) {
        assert.equal(body.tool_choice, "none");
        assert.match(body.instructions, /남은 단계 0/);
        return answer;
      }
      return [tool()];
    });
    assert.equal(await execute({ maxToolRounds: 2 }), "Done");
    calls = 0;
    mock(() => [tool()]);
    await assert.rejects(
      () =>
        generateAi("gpt-5.6-sol", "Test", "Test", {
          tools: [{ name: "read_page" }],
          execute: async () => ({ success: true, data: "unchanged" }),
        }),
      /동일 자료 조회.*저장되지/,
    );
    assert.equal(calls, 3);
    calls = 0;
    await assert.rejects(
      () =>
        generateAi("gpt-5.6-sol", "Test", "Test", {
          tools: [{ name: "read_page" }],
          execute: async () => ({
            success: false,
            status: 400,
            error: "컬럼 형식 오류",
          }),
        }),
      /마지막 도구 오류: 컬럼 형식 오류/,
    );
    assert.equal(calls, 3);
    calls = 0;
    mock(() => calls === 1 ? [tool()] : answer);
    const warned = await generateAi("gpt-5.6-sol", "Test", "Test", {
      tools: [{ name: "read_page" }], execute: async () => ({ success: false, status: 400, error: "컬럼 형식 오류" }),
    });
    assert.match(warned, /서버 확인 도구 오류.*컬럼 형식 오류/);
    calls = 0;
    mock(() => [tool()]);
    await assert.rejects(
      () => execute({ maxToolRounds: 2 }),
      /2단계.*저장되지/,
    );
    assert.equal(calls, 2);
    await assert.rejects(
      () => execute({ deadline: Date.now() - 1 }),
      /시간 제한/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  // Exercise the real chat route, policy loading, guardrails and atomic commit.
  const rooms = load(resolve("app/api/ai/conversations/route.ts"));
  const chats = load(resolve("app/api/ai/chats/route.ts"));
  const request = (input) =>
    new Request("http://localhost:3000/test", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    });
  const sourceContext = { pathname: "/projects/project", tab: "database" };
  const roomResponse = await rooms.POST(
    request({ projectId: "project", targetPage: "database", sourceContext }),
  );
  assert.equal(roomResponse.status, 201);
  const room = (await roomResponse.json()).conversation;
  const policy = {
    ...defaultGuardrailPolicy,
    maxChanges: 100,
    maxToolRounds: 20,
  };
  await client.execute({
    sql: "INSERT INTO ai_guardrail_policies(workspace_id,version,config_json,published_by,published_at) VALUES ('ws',1,?,'owner',?)",
    args: [JSON.stringify(policy), new Date().toISOString()],
  });
  await client.execute({
    sql: "INSERT INTO ai_guardrail_configs(workspace_id,active_version,draft_json,updated_by,updated_at) VALUES ('ws',1,?,'owner',?)",
    args: [JSON.stringify(policy), new Date().toISOString()],
  });
  let routeCalls = 0;
  globalThis.fetch = async (_, options) => {
    assert.match(JSON.parse(options.body).instructions, /최종 답변 포함 20단계/);
    routeCalls++;
    return Response.json({
      id: `synthetic-tool-${routeCalls}`,
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
      output:
        routeCalls === 1
          ? [
              {
                type: "function_call",
                call_id: "read-batch",
                name: "read_page",
                arguments: "{}",
              },
            ]
          : routeCalls === 2
            ? [
                {
                  type: "function_call",
                  call_id: "save-batch",
                  name: "save_database_tables",
                  arguments: JSON.stringify({ items }),
                },
              ]
            : [
                {
                  type: "message",
                  content: [
                    {
                      type: "output_text",
                      text: "테이블 정의서 변경안을 검증했습니다.",
                    },
                  ],
                },
              ],
    });
  };
  try {
    const started = Date.now();
    const response = await chats.POST(
      request({
        projectId: "project",
        convId: room.convId,
        model: "gpt-5.6-sol",
        targetPage: "database",
        expectedTargetVersion: 1,
        sourceContext,
        prompt: "제안요청서를 다시 조회하여 DB 테이블 정의서를 등록해줘",
        requestId: crypto.randomUUID(),
      }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    const output = await response.json();
    assert.equal(output.actions.length, 100);
    assert.equal(routeCalls, 3);
    assert.equal(await count(), before + 100);
    console.log(
      `PASS chat route: 100 table batch committed with chat and actual IDs in ${Date.now() - started}ms (provider mocked).`,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log(
    "PASS AI tool execution: configurable rounds, final answer reserve, repeated reads/errors, diagnostic failures, 100 real table previews/transactional saves, forward FK mapping, rollback, limits and permissions.",
  );
}
