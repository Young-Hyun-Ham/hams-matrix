import assert from "node:assert/strict";
export async function checkAiConversations({
  request,
  client,
  cookie,
  owner,
  other,
  project,
  base,
  makeRoom,
}) {
  await client.execute("DELETE FROM auth_rate_limits");
  const room = await makeRoom(project.id),
    second = await makeRoom(project.id);
  const endpoint = (room) =>
    `/api/ai/chats?projectId=${project.id}&convId=${room.convId}`;
  const post = (data) =>
    request("/api/ai/chats", {
      cookie,
      method: "POST",
      data: { ...base, convId: room.convId, ...data },
    });
  let response = await request(endpoint(room), { cookie });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).chats, []);
  assert.equal((await post({ convId: undefined })).status, 400);
  assert.equal(
    (await request(`/api/ai/chats?projectId=${project.id}`, { cookie })).status,
    400,
  );
  assert.equal(
    (await request(endpoint(room), { cookie: other.cookie })).status,
    404,
  );
  assert.equal(
    (await request(`/api/ai/chats?convId=${room.convId}`, { cookie })).status,
    404,
  );
  assert.equal(
    (
      await request(`/api/ai/conversations/${room.convId}`, {
        cookie: other.cookie,
        method: "PATCH",
        data: { projectId: project.id, title: "Unauthorized" },
      })
    ).status,
    404,
  );
  const rename = (title) =>
    request(`/api/ai/conversations/${room.convId}`, {
      cookie,
      method: "PATCH",
      data: { projectId: project.id, title },
    });
  assert.equal((await rename(" ")).status, 400);
  assert.equal((await rename("x".repeat(101))).status, 400);
  response = await rename("WBS 일정 검토");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).conversation.title, "WBS 일정 검토");
  assert.ok(
    (
      await (
        await request(`/api/ai/conversations?projectId=${project.id}`, {
          cookie,
        })
      ).json()
    ).conversations.some(
      (item) => item.convId === room.convId && item.title === "WBS 일정 검토",
    ),
  );
  const first = await post({ prompt: "이번 프로젝트 이름은 기억 검증입니다." });
  assert.equal(first.status, 200, await first.clone().text());
  const firstChat = (await first.json()).chat;
  const followup = await post({
    prompt: "방금 말한 이름을 알려줘",
    tab: "wbs",
  });
  assert.equal(followup.status, 200, await followup.clone().text());
  const data = JSON.parse((await followup.json()).chat.result);
  assert.deepEqual(data.historyRoles, ["user", "assistant"]);
  assert.deepEqual(data.previousRequests, [firstChat.prompt]);
  assert.ok(data.instructions.includes("현재 탭: WBS"));
  response = await request(endpoint(second), { cookie });
  assert.deepEqual((await response.json()).chats, []);
  assert.equal(
    (await post({ convId: second.convId, prompt: "독립 대화" })).status,
    200,
  );
  const standalone = (
    await (await request(endpoint(second), { cookie })).json()
  ).chats[0];
  assert.deepEqual(JSON.parse(standalone.result).historyRoles, []);
  // Another project owned by the same user must still reject this conversation.
  const pr = await request("/api/projects", {
    cookie,
    method: "POST",
    data: { name: "분리 프로젝트", description: "", memberIds: [] },
  });
  assert.equal(pr.status, 201);
  const otherProject = (await pr.json()).project;
  assert.equal(
    (
      await request(
        `/api/ai/chats?projectId=${otherProject.id}&convId=${room.convId}`,
        { cookie },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await post({
        projectId: otherProject.id,
        pathname: `/projects/${otherProject.id}`,
      })
    ).status,
    404,
  );
  // Database guards reject cross-user/project bindings as well as missing conversations.
  await assert.rejects(
    client.execute({
      sql: "INSERT INTO ai_prompt_chats(id,workspace_id,user_id,project_id,pathname,screen_title,prompt,model,result,conv_id) VALUES ('bad-scope',?,?,?,?,?,?,?,?,?)",
      args: [
        owner.user.workspaceId,
        owner.user.id,
        otherProject.id,
        base.pathname,
        "test",
        "test",
        base.model,
        "test",
        room.convId,
      ],
    }),
  );
  await client.execute({
    sql: "UPDATE ai_conversations SET request_id='busy-test',busy_until=? WHERE conv_id=?",
    args: [new Date(Date.now() + 60000).toISOString(), room.convId],
  });
  assert.equal((await post({ prompt: "동시 전송" })).status, 409);
  await client.execute({
    sql: "UPDATE ai_conversations SET request_id=NULL,busy_until=NULL WHERE conv_id=?",
    args: [room.convId],
  });
  assert.equal((await post({ prompt: "[FAIL]" })).status, 429);
  assert.equal(
    (
      await client.execute({
        sql: "SELECT request_id FROM ai_conversations WHERE conv_id=?",
        args: [room.convId],
      })
    ).rows[0].request_id,
    null,
  );
  assert.equal((await post({ prompt: "실패 후 다시 시도" })).status, 200);
  const paged = await makeRoom(project.id);
  await client.batch(
    Array.from({ length: 55 }, (_, index) => ({
      sql: "INSERT INTO ai_prompt_chats(id,workspace_id,user_id,project_id,pathname,screen_title,prompt,model,result,conv_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
      args: [
        `page-${index}`,
        owner.user.workspaceId,
        owner.user.id,
        project.id,
        base.pathname,
        "test",
        `prompt-${index}`,
        base.model,
        "reply",
        paged.convId,
      ],
    })),
    "write",
  );
  const latest = await (await request(endpoint(paged), { cookie })).json();
  assert.equal(latest.chats.length, 50);
  assert.equal(latest.chats[0].prompt, "prompt-5");
  assert.equal(latest.chats.at(-1).prompt, "prompt-54");
  const older = await (
    await request(`${endpoint(paged)}&before=${latest.nextCursor}`, { cookie })
  ).json();
  assert.equal(older.chats.length, 5);
  assert.equal(older.chats[0].prompt, "prompt-0");
  assert.equal(older.nextCursor, null);
  console.log(
    "PASS: explicit room creation, rename, project/user isolation, required convId, multi-turn context, cross-tab prompts, stable pagination, DB scope guards and generation lock recovery.",
  );
}
