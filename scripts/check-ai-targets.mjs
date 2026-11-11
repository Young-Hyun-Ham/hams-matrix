import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkAiTargets({ load, client, setToken }) {
  const rooms = load(resolve("app/api/ai/conversations/route.ts"));
  const roomApi = load(resolve("app/api/ai/conversations/[convId]/route.ts"));
  const chats = load(resolve("app/api/ai/chats/route.ts"));
  const { mergeConversationTarget } = load(resolve("lib/ai-target-pages.ts"));
  const request = (
    input,
    method = "POST",
    url = "http://localhost:3000/test",
  ) =>
    new Request(url, {
      method,
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: method === "GET" ? undefined : JSON.stringify(input),
    });
  const roomContext = (room) => ({
    params: Promise.resolve({ convId: room.convId }),
  });
  const sourceContext = { pathname: "/projects/project", tab: "database" };
  const makeRoom = async (
    targetPage = "database",
    projectId = "project",
    source = sourceContext,
  ) => {
    const response = await rooms.POST(
      request({ projectId, targetPage, sourceContext: source }),
    );
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).conversation;
  };
  const patch = (
    room,
    targetPage,
    expectedTargetVersion = room.targetVersion,
  ) =>
    roomApi.PATCH(
      request(
        { projectId: room.projectId, targetPage, expectedTargetVersion },
        "PATCH",
      ),
      roomContext(room),
    );
  const originalFetch = globalThis.fetch;
  const captures = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("https://api.openai.com/v1/"));
    if (String(url).endsWith("/models"))
      return Response.json({ data: [{ id: "gpt-5.6-sol" }] });
    const data = JSON.parse(options.body);
    const content = Array.isArray(data.input)
      ? data.input.findLast((item) => item.role === "user").content
      : data.input;
    const text = Array.isArray(content)
      ? content.find((part) => part.type === "input_text").text
      : content;
    const input = JSON.parse(text);
    const usage = {
      id: `synthetic-${crypto.randomUUID()}`,
      status: "completed",
      model: data.model,
      usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
    };
    if (data.text?.format?.name === "guardrail_verdict")
      return Response.json({
        ...usage,
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({ category: "safe", risk: 0.01 }),
              },
            ],
          },
        ],
      });
    captures.push({
      instructions: data.instructions,
      input,
      tools: data.tools,
    });
    const toolOutputs = Array.isArray(data.input)
      ? data.input.filter((item) => item.type === "function_call_output")
      : [];
    if (input.request.includes("[CREATE_TARGET]") && !toolOutputs.length)
      return Response.json({
        ...usage,
        output: [
          {
            type: "function_call",
            name: "save_artifact",
            call_id: "target-tool",
            arguments: JSON.stringify({
              action: "CREATE",
              title: "Target requirement",
              status: "초안",
              fields: {
                category: "SFR",
                definition: "From selected target",
                details: "Persist in requirements, not database",
                priority: "중",
              },
            }),
          },
        ],
      });
    return Response.json({
      ...usage,
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                targetInstructions: data.instructions,
                tools: data.tools.map((tool) => tool.name),
                toolResults: toolOutputs.map((item) => JSON.parse(item.output)),
              }),
            },
          ],
        },
      ],
    });
  };
  try {
    setToken("owner-token");
    let room = await makeRoom();
    assert.equal(room.targetPage, "database");
    assert.equal(room.targetVersion, 1);
    const oldActivity = room.updatedAt;
    let response = await patch(room, "requirement");
    assert.equal(response.status, 200, await response.clone().text());
    room = (await response.json()).conversation;
    assert.equal(room.targetPage, "requirement");
    assert.equal(room.targetVersion, 2);
    assert.equal(
      room.updatedAt,
      oldActivity,
      "target changes do not reorder rooms",
    );
    const list = await (
      await rooms.GET(
        request(
          undefined,
          "GET",
          "http://localhost:3000/api/ai/conversations?projectId=project",
        ),
      )
    ).json();
    assert.equal(
      list.conversations.find((item) => item.convId === room.convId).targetPage,
      "requirement",
    );
    assert.equal(
      (await makeRoom("wbs", "project", { ...sourceContext, tab: "wbs" }))
        .targetPage,
      "wbs",
      "new room uses its own current page",
    );
    assert.equal(
      (
        await rooms.POST(
          request({ projectId: "project", targetPage: "wbs", sourceContext }),
        )
      ).status,
      400,
    );
    assert.equal((await patch(room, "team")).status, 400);
    assert.equal((await patch(room, "__proto__")).status, 400);
    assert.equal((await patch(room, "database", -1)).status, 400);
    assert.equal((await patch(room, "database", 1.2)).status, 400);
    assert.equal(
      (await patch({ ...room, projectId: "second" }, "database")).status,
      404,
    );
    setToken("admin-token");
    assert.equal((await patch(room, "database")).status, 404);
    setToken("owner-token");
    const base = {
      projectId: "project",
      convId: room.convId,
      model: "gpt-5.6-sol",
      targetPage: room.targetPage,
      expectedTargetVersion: room.targetVersion,
      sourceContext,
      prompt: "요구사항을 등록해줘 [CREATE_TARGET]",
      requestId: crypto.randomUUID(),
    };
    response = await chats.POST(request(base));
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.actions.length, 1);
    assert.equal(result.chat.targetPage, "requirement");
    const artifact = (
      await client.execute({
        sql: "SELECT kind FROM project_artifacts WHERE id=?",
        args: [result.actions[0].id],
      })
    ).rows[0];
    assert.equal(artifact.kind, "requirement");
    const stored = (
      await client.execute({
        sql: "SELECT * FROM ai_prompt_chats WHERE id=?",
        args: [result.chat.id],
      })
    ).rows[0];
    assert.equal(stored.pathname, sourceContext.pathname);
    assert.equal(stored.tab, "database");
    assert.equal(stored.target_page, "requirement");
    assert.equal(stored.target_version, 2);
    assert.ok(stored.screen_title.includes("요구사항"));
    const job = (
      await client.execute({
        sql: "SELECT target_page,target_version FROM ai_generation_requests WHERE request_id=?",
        args: [base.requestId],
      })
    ).rows[0];
    assert.equal(job.target_page, "requirement");
    assert.equal(job.target_version, 2);
    assert.ok(captures.at(-1).instructions.includes("AI 대상 탭: 요구사항"));
    assert.ok(!captures.at(-1).instructions.includes("DB 설계 담당자 역할"));
    response = await chats.POST(
      request({
        ...base,
        requestId: crypto.randomUUID(),
        sourceContext: { ...sourceContext, tab: "wbs" },
        prompt: "현황을 분석해줘",
      }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    const calls = captures.length;
    assert.equal(
      (
        await chats.POST(
          request({
            ...base,
            expectedTargetVersion: 1,
            requestId: crypto.randomUUID(),
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await chats.POST(
          request({
            ...base,
            sourceContext: undefined,
            targetPage: undefined,
            expectedTargetVersion: undefined,
            pathname: sourceContext.pathname,
            tab: "database",
            requestId: crypto.randomUUID(),
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      captures.length,
      calls,
      "stale targets fail before paid calls",
    );
    const competing = await Promise.all([
      patch(room, "program"),
      patch(room, "database"),
    ]);
    assert.deepEqual(competing.map((item) => item.status).sort(), [200, 409]);
    room = (await competing.find((item) => item.status === 200).json())
      .conversation;
    assert.equal(room.targetVersion, 3);
    assert.equal(
      mergeConversationTarget(room, {
        ...room,
        targetPage: "requirement",
        targetVersion: 2,
      }).targetPage,
      room.targetPage,
    );
    await client.execute({
      sql: "UPDATE ai_conversations SET request_id='synthetic-busy',busy_until=? WHERE conv_id=?",
      args: [new Date(Date.now() + 60000).toISOString(), room.convId],
    });
    assert.equal((await patch(room, "wbs")).status, 409);
    await client.execute({
      sql: "UPDATE ai_conversations SET request_id=NULL,busy_until=NULL WHERE conv_id=?",
      args: [room.convId],
    });
    await client.execute({
      sql: "INSERT INTO ai_generation_requests(request_id,workspace_id,user_id,conv_id,status) VALUES ('synthetic-stop','ws','owner',?,'stop_requested')",
      args: [room.convId],
    });
    assert.equal(
      (await patch(room, "wbs")).status,
      409,
      "unconfirmed stop blocks changes",
    );
    await client.execute(
      "DELETE FROM ai_generation_requests WHERE request_id='synthetic-stop'",
    );
    const documents = await makeRoom("documents", "project", {
      ...sourceContext,
      tab: "documents",
    });
    assert.equal(documents.targetPage, "documents");
    assert.equal(
      (
        await chats.POST(
          request({
            ...base,
            convId: documents.convId,
            targetPage: "documents",
            expectedTargetVersion: 1,
            prompt: "분석해줘",
            requestId: crypto.randomUUID(),
          }),
        )
      ).status,
      400,
    );
    assert.equal((await patch(documents, "database")).status, 200);
    const legacyResponse = await rooms.POST(request({ projectId: "project" }));
    const legacy = (await legacyResponse.json()).conversation;
    assert.equal(legacy.targetPage, null);
    assert.equal(legacy.targetVersion, 0);
    assert.equal((await patch(legacy, "database")).status, 200);
    setToken("reader-token");
    let reader = await makeRoom();
    response = await patch(reader, "requirement");
    reader = (await response.json()).conversation;
    response = await chats.POST(
      request({
        ...base,
        convId: reader.convId,
        expectedTargetVersion: reader.targetVersion,
        prompt: "요구사항을 조회해줘",
        requestId: crypto.randomUUID(),
      }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(JSON.parse((await response.json()).chat.result).tools, [
      "read_page",
    ]);
    setToken("owner-token");
    await client.execute(
      "UPDATE user_subscriptions SET plan_code='free' WHERE user_id='owner'",
    );
    await client.execute(
      "UPDATE workspaces SET plan='free',subscription_plan='free' WHERE id='ws'",
    );
    const temp = await makeRoom();
    assert.ok(temp.convId.startsWith("temporary-"));
    assert.equal(
      (
        await client.execute({
          sql: "SELECT * FROM ai_conversations WHERE conv_id=?",
          args: [temp.convId],
        })
      ).rows.length,
      0,
    );
    response = await chats.POST(
      request({
        ...base,
        convId: temp.convId,
        targetPage: "requirement",
        expectedTargetVersion: 4,
        prompt: "요구사항을 분석해줘",
        requestId: crypto.randomUUID(),
      }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json()).chat.targetVersion, 4);
    assert.equal(
      (
        await client.execute({
          sql: "SELECT * FROM ai_prompt_chats WHERE conv_id=?",
          args: [temp.convId],
        })
      ).rows.length,
      0,
    );
    assert.equal(
      mergeConversationTarget(
        { ...temp, targetPage: "requirement", targetVersion: 4 },
        { ...temp, targetPage: null, targetVersion: 0 },
      ).targetPage,
      "requirement",
    );
    assert.equal(
      (
        await rooms.POST(
          request({
            projectId: "",
            targetPage: "team",
            sourceContext: { pathname: "/team", tab: null },
          }),
        )
      ).status,
      403,
    );
    await client.execute(
      "UPDATE user_subscriptions SET plan_code='business' WHERE user_id='owner'",
    );
    await client.execute(
      "UPDATE workspaces SET plan='business',subscription_plan='business' WHERE id='ws'",
    );
    console.log(
      "PASS AI targets: current-page defaults, immediate durable selection, cross-page prompt/tools and artifact writes, snapshots, CAS races/stale responses, generation/stop locks, access isolation, read-only, documents, legacy initialization and temporary-room policy.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
