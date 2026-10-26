import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkProjects({
  request,
  client,
  cookie,
  user,
  outsider,
}) {
  const teammate = randomUUID();
  await client.batch(
    [
      {
        sql: "INSERT INTO users(id,name) VALUES (?,?)",
        args: [teammate, "프로젝트 팀원"],
      },
      {
        sql: "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,'member')",
        args: [user.workspaceId, teammate],
      },
    ],
    "write",
  );
  assert.equal((await request("/api/projects")).status, 401);
  assert.equal((await request("/api/team/members")).status, 401);
  const members = await request(
    `/api/team/members?workspaceId=${outsider.workspaceId}`,
    { cookie },
  );
  assert.equal(members.status, 200);
  const ids = (await members.json()).members.map((member) => member.id);
  assert.ok(ids.includes(teammate));
  assert.ok(!ids.includes(outsider.id));
  const create = (data, extra = {}) =>
    request("/api/projects", { method: "POST", cookie, data, ...extra });
  const input = {
    name: "실제 프로젝트",
    description: "프로젝트 설명",
    memberIds: [teammate, teammate],
  };
  assert.equal(
    (await create(input, { requestOrigin: "https://invalid.test" })).status,
    403,
  );
  assert.equal((await create({ ...input, name: " " })).status, 400);
  assert.equal(
    (await create({ ...input, description: "a".repeat(2001) })).status,
    400,
  );
  assert.equal(
    (await create({ ...input, memberIds: [outsider.id] })).status,
    400,
  );
  assert.equal(
    (await create({ ...input, memberIds: [randomUUID()] })).status,
    400,
  );
  assert.equal((await create({ ...input, memberIds: [123] })).status, 400);
  const result = await create(input);
  assert.equal(result.status, 201, await result.clone().text());
  const project = (await result.json()).project;
  assert.equal(project.description, input.description);
  assert.deepEqual(
    new Set(project.members.map((member) => member.id)),
    new Set([user.id, teammate]),
  );
  const list = await request("/api/projects", { cookie });
  assert.ok(
    (await list.json()).projects.some((item) => item.id === project.id),
  );
  const audit = await client.execute({
    sql: "SELECT after_json FROM audit_logs WHERE resource_type='project' AND resource_id=? AND action='CREATE'",
    args: [project.id],
  });
  assert.deepEqual(
    new Set(JSON.parse(audit.rows[0].after_json).memberIds),
    new Set([user.id, teammate]),
  );
  await client.execute(
    "CREATE TRIGGER test_project_audit BEFORE INSERT ON audit_logs WHEN NEW.resource_type='project' AND NEW.action='CREATE' BEGIN SELECT RAISE(ABORT,'project audit rejected'); END",
  );
  assert.equal((await create({ ...input, name: "롤백 프로젝트" })).status, 500);
  await client.execute("DROP TRIGGER test_project_audit");
  assert.equal(
    Number(
      (
        await client.execute(
          "SELECT count(*) AS n FROM projects WHERE name='롤백 프로젝트'",
        )
      ).rows[0].n,
    ),
    0,
  );
  await client.execute({
    sql: "UPDATE workspace_members SET role='viewer' WHERE workspace_id=? AND user_id=?",
    args: [user.workspaceId, user.id],
  });
  assert.equal((await create(input)).status, 403);
  await client.execute({
    sql: "UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?",
    args: [user.role, user.workspaceId, user.id],
  });
  await client.execute(
    "UPDATE app_settings SET value_json='false' WHERE setting_key='DB_LOGGING_ENABLED'",
  );
  const disabled = await create({ ...input, name: "로그 없는 프로젝트" });
  assert.equal(disabled.status, 201);
  const disabledId = (await disabled.json()).project.id;
  assert.equal(
    Number(
      (
        await client.execute({
          sql: "SELECT count(*) AS n FROM audit_logs WHERE resource_id=?",
          args: [disabledId],
        })
      ).rows[0].n,
    ),
    0,
  );
  await client.execute(
    "UPDATE app_settings SET value_json='true' WHERE setting_key='DB_LOGGING_ENABLED'",
  );
  console.log(
    "PASS: project creation, multiple team members, persistence, validation, permissions, tenant isolation, atomic audit rollback and DB logging toggle.",
  );
}
