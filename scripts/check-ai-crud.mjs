import assert from "node:assert/strict";
export async function checkAiCrud({
  request,
  client,
  cookie,
  owner,
  other,
  project,
  base,
  commonRoom,
}) {
  await client.execute("DELETE FROM auth_rate_limits");
  const post = (data) =>
    request("/api/ai/chats", {
      cookie,
      method: "POST",
      data: { ...base, ...data },
    });
  const tool = async (args, text, overrides = {}, name = "save_artifact") => {
    const response = await post({
      prompt: `${text} [TOOL]${Buffer.from(JSON.stringify({ name, args })).toString("base64")}`,
      ...overrides,
    });
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    const first = result.chat.result.split("\n\n[서버 확인 실행 결과]")[0];
    return {
      ...result,
      tool: first.startsWith("{") ? JSON.parse(first) : null,
    };
  };
  const apiCreate = async (kind, title, fields, links = []) => {
    const response = await request(`/api/projects/${project.id}/artifacts`, {
      cookie,
      method: "POST",
      data: { kind, title, status: "초안", fields, links },
    });
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).artifact;
  };
  const requirement = await apiCreate("requirement", "회원 조회 요구사항", {
    category: "SFR",
    definition: "회원 조회",
    details: "등록된 회원을 조회",
    priority: "중",
  });
  const created = await tool(
    {
      action: "CREATE",
      title: "AI CRUD 화면",
      fields: { definition: "관리 화면", details: "목록·검색·상세" },
      links: [requirement.id],
    },
    "AI CRUD 화면을 등록해줘",
  );
  assert.equal(created.actions.length, 1);
  assert.equal(created.tool.success, true);
  const artifact = created.actions[0];
  const current = async () =>
    (
      await (
        await request(`/api/projects/${project.id}/artifacts`, { cookie })
      ).json()
    ).artifacts.find((a) => a.id === artifact.id);
  assert.equal((await current()).fields.details, "목록·검색·상세");
  const read = await tool({}, "화면 목록을 조회해줘", {}, "read_page");
  assert.equal(read.tool.success, true);
  assert.ok(read.tool.data.artifacts.some((a) => a.id === artifact.id));
  const updated = await tool(
    {
      action: "UPDATE",
      id: artifact.id,
      version: 1,
      fields: { definition: "변경한 개요" },
    },
    `${artifact.code}의 개요를 수정해줘`,
  );
  assert.equal(updated.tool.success, true);
  assert.equal((await current()).version, 2);
  assert.equal((await current()).fields.details, "목록·검색·상세");
  assert.deepEqual((await current()).links, [requirement.id]);
  const conflict = await tool(
    { action: "UPDATE", id: artifact.id, version: 1, title: "충돌" },
    `${artifact.code}의 명칭을 수정해줘`,
  );
  assert.equal(conflict.tool.status, 409);
  assert.equal(conflict.actions.length, 0);
  const linkedDelete = await tool(
    { action: "DELETE", id: artifact.id, version: 2 },
    `${artifact.code} 삭제해줘`,
  );
  assert.equal(linkedDelete.tool.status, 409);
  assert.ok(await current());
  const wrongKind = await tool(
    { action: "DELETE", id: requirement.id, version: 1 },
    `${requirement.code} 삭제해줘`,
  );
  assert.equal(wrongKind.tool.status, 404);
  const readonly = await tool(
    { action: "DELETE", id: artifact.id, version: 2 },
    `${artifact.code} 삭제해줘`,
    { tab: "history" },
  );
  assert.equal(readonly.tool.status, 403);
  const noIntent = await tool(
    {
      action: "CREATE",
      title: "저장 금지",
      fields: { definition: "초안", details: "초안" },
    },
    "화면 초안을 추천해줘",
  );
  assert.equal(noIntent.tool.status, 403);
  const negative = await tool(
    { action: "DELETE", id: artifact.id, version: 2 },
    `${artifact.code} 삭제하지 말고 조회해줘`,
  );
  assert.equal(negative.tool.status, 403);
  const clear = await tool(
    { action: "UPDATE", id: artifact.id, version: 2, links: [] },
    `${artifact.code}의 연결을 수정해줘`,
  );
  assert.equal(clear.tool.success, true);
  const deleted = await tool(
    { action: "DELETE", id: artifact.id, version: 3 },
    `${artifact.code} 삭제해줘`,
  );
  assert.equal(deleted.tool.success, true);
  assert.equal(await current(), undefined);
  const committed = await tool(
    {
      action: "CREATE",
      title: "설명 실패 후 저장",
      fields: { definition: "개요", details: "상세" },
    },
    "화면을 등록해줘 [FAIL_AFTER_WRITE]",
  );
  assert.equal(committed.actions.length, 1);
  assert.ok(committed.chat.result.includes("DB에 반영"));
  const revisions = await client.execute({
    sql: "SELECT action FROM artifact_revisions WHERE artifact_id=? ORDER BY version",
    args: [artifact.id],
  });
  assert.deepEqual(
    revisions.rows.map((row) => row.action),
    ["CREATE", "UPDATE", "UPDATE", "DELETE"],
  );
  await client.execute("DELETE FROM auth_rate_limits");
  for (const tab of [
    "architecture",
    "requirement",
    "database",
    "program",
    "test",
    "trace",
    "acceptance",
    "export",
    "history",
  ]) {
    const response = await post({ tab, prompt: "현재 자료를 설명해줘" });
    assert.equal(response.status, 200);
    const data = JSON.parse((await response.json()).chat.result);
    assert.ok(data.instructions.includes("현재 탭:"));
    if (tab === "history") {
      assert.ok(Array.isArray(data.input.pageContext.revisions));
      assert.equal(data.input.pageContext.artifacts, undefined);
    }
    if (tab === "architecture")
      assert.deepEqual(data.input.pageContext.artifacts, []);
    if (tab === "acceptance") assert.ok(data.input.pageContext.report);
  }
  const team = await post({
    convId: commonRoom.convId,
    pathname: "/team",
    tab: null,
    projectId: "",
    prompt: "팀 상태를 설명해줘",
  });
  assert.equal(team.status, 200);
  const teamData = JSON.parse((await team.json()).chat.result);
  assert.ok(
    teamData.input.pageContext.members.some((m) => m.id === owner.user.id),
  );
  await client.batch(
    [
      {
        sql: "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,'viewer')",
        args: [owner.user.workspaceId, other.user.id],
      },
      {
        sql: "INSERT INTO project_members(project_id,workspace_id,user_id) VALUES (?,?,?)",
        args: [project.id, owner.user.workspaceId, other.user.id],
      },
      {
        sql: "UPDATE users SET account_role='user',active_workspace_id=? WHERE id=?",
        args: [owner.user.workspaceId, other.user.id],
      },
      {
        sql: "UPDATE sessions SET workspace_id=? WHERE user_id=?",
        args: [owner.user.workspaceId, other.user.id],
      },
    ],
    "write",
  );
  const viewerRoomResponse = await request("/api/ai/conversations", {
    cookie: other.cookie,
    method: "POST",
    data: { projectId: project.id },
  });
  assert.equal(viewerRoomResponse.status, 201);
  const viewerRoom = (await viewerRoomResponse.json()).conversation;
  const denied = await request("/api/ai/chats", {
    cookie: other.cookie,
    method: "POST",
    data: {
      ...base,
      convId: viewerRoom.convId,
      prompt: `화면을 등록해줘 [TOOL]${Buffer.from(JSON.stringify({ name: "save_artifact", args: { action: "CREATE", title: "권한 없음", fields: { definition: "개요", details: "상세" } } })).toString("base64")}`,
    },
  });
  assert.equal(denied.status, 200);
  assert.equal(JSON.parse((await denied.json()).chat.result).status, 403);
  console.log(
    "PASS: actual AI tool CRUD, partial update preservation, revisions, optimistic concurrency, linked deletion guard, tab and role boundaries, explicit intent, committed-write recovery and page-specific data sources.",
  );
}
