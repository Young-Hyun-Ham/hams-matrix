import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
function unzipStored(buffer) {
  const entries = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18),
      nameLength = buffer.readUInt16LE(offset + 26),
      extra = buffer.readUInt16LE(offset + 28);
    const name = buffer
      .subarray(offset + 30, offset + 30 + nameLength)
      .toString();
    const start = offset + 30 + nameLength + extra;
    entries.set(name, buffer.subarray(start, start + size).toString());
    offset = start + size;
  }
  return entries;
}
export async function checkArtifacts({
  request,
  client,
  cookie,
  user,
  otherCookie,
}) {
  const createProject = async (name) => {
    const r = await request("/api/projects", {
      method: "POST",
      cookie,
      data: { name, description: "추적성 통합 테스트", memberIds: [] },
    });
    assert.equal(r.status, 201, await r.clone().text());
    return (await r.json()).project;
  };
  const project = await createProject("문서 연결 검증"),
    foreign = await createProject("프로젝트 격리 검증");
  const base = `/api/projects/${project.id}/artifacts`;
  const input = (kind, links = []) => ({
    kind,
    title: kind + " 테스트",
    status: "초안",
    fields: {
      category: "SFR",
      definition: "정의",
      details: "세부 내용",
      priority: "중",
    },
    links,
  });
  const create = async (data, path = base) => {
    const r = await request(path, { method: "POST", cookie, data });
    assert.equal(r.status, 201, await r.clone().text());
    return (await r.json()).artifact;
  };
  assert.equal((await request(base)).status, 401);
  assert.equal((await request(base, { cookie: otherCookie })).status, 404);
  assert.equal(
    (
      await request(base, {
        method: "POST",
        cookie,
        data: input("requirement"),
        requestOrigin: "https://evil.test",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(base, {
        method: "POST",
        cookie,
        data: { ...input("requirement"), title: "" },
      })
    ).status,
    400,
  );
  const r = await create(input("requirement"));
  assert.equal(r.code, "SFR-001");
  const s = await create(input("screen", [r.id]));
  assert.equal(s.code, "SCR-001");
  const p = await create(input("program", [s.id]));
  assert.equal(p.code, "PGM-001");
  const fr = await create(
    input("requirement"),
    `/api/projects/${foreign.id}/artifacts`,
  );
  assert.equal(
    (
      await request(base, {
        method: "POST",
        cookie,
        data: input("screen", [fr.id]),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(base, {
        method: "POST",
        cookie,
        data: input("requirement", [s.id]),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(base, {
        method: "POST",
        cookie,
        data: input("screen", [randomUUID()]),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`${base}/${r.id}`, {
        method: "DELETE",
        cookie,
        data: { version: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`${base}/${p.id}`, {
        method: "DELETE",
        cookie,
        data: { version: 1 },
      })
    ).status,
    409,
  );
  const edits = await Promise.all(
    ["수정 A", "수정 B"].map((title) =>
      request(`${base}/${r.id}`, {
        method: "PATCH",
        cookie,
        data: { ...input("requirement"), title, version: 1 },
      }),
    ),
  );
  assert.deepEqual(edits.map((x) => x.status).sort(), [200, 409]);
  const current = (
    await (await request(base, { cookie })).json()
  ).artifacts.find((a) => a.id === r.id);
  assert.equal(current.version, 2);
  assert.equal(current.code, r.code);
  assert.equal(
    (
      await request(`${base}/${r.id}`, {
        method: "PATCH",
        cookie,
        data: {
          ...input("requirement"),
          fields: { ...input("requirement").fields, category: "PER" },
          version: 2,
        },
      })
    ).status,
    400,
  );
  await client.execute({
    sql: "UPDATE workspace_members SET role='viewer' WHERE workspace_id=? AND user_id=?",
    args: [user.workspaceId, user.id],
  });
  assert.equal(
    (await request(base, { method: "POST", cookie, data: input("screen") }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(`${base}/${r.id}`, {
        method: "PATCH",
        cookie,
        data: { ...input("requirement"), version: 2 },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`${base}/${r.id}`, {
        method: "DELETE",
        cookie,
        data: { version: 2 },
      })
    ).status,
    403,
  );
  assert.equal((await request(base, { cookie })).status, 200);
  await client.execute({
    sql: "UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?",
    args: [user.role, user.workspaceId, user.id],
  });
  const exported = await request(`/api/projects/${project.id}/export`, {
    cookie,
  });
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-type"), /spreadsheetml/);
  const entries = unzipStored(Buffer.from(await exported.arrayBuffer()));
  assert.match(entries.get("xl/workbook.xml"), /요구사항정의서/);
  assert.match(entries.get("xl/workbook.xml"), /화면설계서/);
  assert.match(entries.get("xl/workbook.xml"), /프로그램설계서/);
  const trace = entries.get("xl/worksheets/sheet5.xml");
  for (const code of [r.code, s.code, p.code]) assert.ok(trace.includes(code));
  assert.equal(
    (
      await request(`/api/projects/${project.id}/export`, {
        cookie: otherCookie,
      })
    ).status,
    404,
  );
  await create({
    ...input("requirement"),
    title: '=HYPERLINK("https://example.test")',
  });
  const bytes = Buffer.from(
    await (
      await request(`/api/projects/${project.id}/export`, { cookie })
    ).arrayBuffer(),
  );
  const xml = unzipStored(bytes).get("xl/worksheets/sheet2.xml");
  assert.ok(xml.includes("=HYPERLINK"));
  assert.ok(!xml.includes("<f>"));
  assert.ok(xml.includes('t="inlineStr"'));
  const beforeRows = Number(
    (await client.execute("SELECT count(*) AS n FROM project_artifacts"))
      .rows[0].n,
  );
  await client.execute(
    "CREATE TRIGGER test_artifact_revision BEFORE INSERT ON artifact_revisions BEGIN SELECT RAISE(ABORT,'rejected'); END",
  );
  assert.equal(
    (
      await request(base, {
        method: "POST",
        cookie,
        data: input("requirement"),
      })
    ).status,
    500,
  );
  await client.execute("DROP TRIGGER test_artifact_revision");
  assert.equal(
    Number(
      (await client.execute("SELECT count(*) AS n FROM project_artifacts"))
        .rows[0].n,
    ),
    beforeRows,
  );
  await client.execute(
    "UPDATE app_settings SET value_json='false' WHERE setting_key='DB_LOGGING_ENABLED'",
  );
  const noLogs = await create(input("requirement"));
  assert.equal(noLogs.code, "SFR-003");
  assert.equal(
    Number(
      (
        await client.execute({
          sql: "SELECT count(*) AS n FROM artifact_revisions WHERE artifact_id=?",
          args: [noLogs.id],
        })
      ).rows[0].n,
    ),
    1,
  );
  await client.execute(
    "UPDATE app_settings SET value_json='true' WHERE setting_key='DB_LOGGING_ENABLED'",
  );
  await assert.rejects(
    client.execute({
      sql: "UPDATE artifact_revisions SET actor_name='변조' WHERE artifact_id=?",
      args: [noLogs.id],
    }),
  );
  const unlinked = await create({
    ...input("program"),
    title: "연결 해제 프로그램",
  });
  assert.equal(
    (
      await request(`${base}/${unlinked.id}`, {
        method: "DELETE",
        cookie,
        data: { version: 1 },
      })
    ).status,
    200,
  );
  const next = await create(input("program"));
  assert.equal(next.code, "PGM-003");
  const fresh = await (await request(base, { cookie })).json();
  assert.ok(!fresh.artifacts.some((a) => a.id === unlinked.id));
  assert.ok(
    fresh.revisions.some(
      (a) => a.artifactId === unlinked.id && a.action === "DELETE",
    ),
  );
  const list = await (await request("/api/projects", { cookie })).json(),
    item = list.projects.find((a) => a.id === project.id);
  assert.equal(item.stats.requirements, 3);
  assert.equal(item.stats.screens, 1);
  assert.equal(item.stats.programs, 2);
  assert.ok(list.activities.some((a) => a.projectId === project.id));
  const detail = await request(`/projects/${project.id}`, { cookie });
  assert.equal(detail.status, 200);
  console.log(
    "PASS: artifact CRUD, persistent IDs, concurrent updates, project isolation, writer permissions, deletion guards, atomic revisions, disabled audit logging, dashboard statistics and XLSX traceability.",
  );
}
