import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const folder = await mkdtemp(join(tmpdir(), "matrix-migration-"));
const client = createClient({
  url: pathToFileURL(join(folder, "migration.db")).href,
});
const directory = new URL("../db/migrations/", import.meta.url);
try {
  for (const name of (await readdir(directory))
    .filter((n) => n.endsWith(".sql") && n < "006")
    .sort())
    await client.executeMultiple(
      await readFile(new URL(name, directory), "utf8"),
    );
  await client.executeMultiple(
    `INSERT INTO users(id,name) VALUES ('user','마이그레이션 사용자'); INSERT INTO workspaces(id,name) VALUES ('workspace','보존 검증'); INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('workspace','user','owner'); INSERT INTO projects(id,workspace_id,name,created_by) VALUES ('project','workspace','기존 프로젝트','user');`,
  );
  for (const [id, kind, code, deleted] of [
    ["r", "requirement", "SFR-001", null],
    ["s", "screen", "SCR-001", null],
    ["p", "program", "PGM-001", null],
    ["deleted", "requirement", "SFR-002", "2026-10-01"],
  ])
    await client.execute({
      sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,version,created_by,updated_by,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        id,
        "workspace",
        "project",
        kind,
        code,
        "기존 문서",
        "승인",
        '{"definition":"보존"}',
        3,
        "user",
        "user",
        "2026-10-01",
        "2026-10-02",
        deleted,
      ],
    });
  await client.executeMultiple(
    `INSERT INTO artifact_links VALUES ('s','r','project','workspace'),('p','s','project','workspace'); INSERT INTO artifact_revisions VALUES ('rev','r','project','workspace',3,'UPDATE','user','기존 이름','{"id":"r","code":"SFR-001","version":3}','2026-10-02'); INSERT INTO project_sequences VALUES ('project','SFR',2);`,
  );
  const before = {
    artifacts: (
      await client.execute("SELECT * FROM project_artifacts ORDER BY id")
    ).rows,
    links: (
      await client.execute("SELECT * FROM artifact_links ORDER BY source_id")
    ).rows,
    revisions: (await client.execute("SELECT * FROM artifact_revisions")).rows,
  };
  await client.executeMultiple(
    "BEGIN IMMEDIATE;\n" +
      (await readFile(
        new URL("006_integrated_deliverables.sql", directory),
        "utf8",
      )) +
      "\nCOMMIT;",
  );
  const after = (
    await client.execute("SELECT * FROM project_artifacts ORDER BY id")
  ).rows;
  for (let i = 0; i < before.artifacts.length; i++) {
    const { structure_json, ...row } = after[i];
    assert.deepEqual({ ...row }, { ...before.artifacts[i] });
    assert.equal(structure_json, "{}");
  }
  assert.deepEqual(
    (
      await client.execute(
        "SELECT source_id,target_id,project_id,workspace_id FROM artifact_links ORDER BY source_id",
      )
    ).rows,
    before.links,
  );
  assert.deepEqual(
    (await client.execute("SELECT * FROM artifact_revisions")).rows,
    before.revisions,
  );
  assert.equal(
    (
      await client.execute(
        "SELECT value FROM project_sequences WHERE prefix='SFR'",
      )
    ).rows[0].value,
    2,
  );
  assert.deepEqual((await client.execute("PRAGMA foreign_key_check")).rows, []);
  await assert.rejects(
    client.execute("DELETE FROM artifact_revisions WHERE id='rev'"),
  );
  await client.execute(
    "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,created_by,updated_by,created_at,updated_at) VALUES ('w','workspace','project','wbs','WBS-001','신규 WBS','초안','{}','user','user','2026-10-26','2026-10-26')",
  );
  console.log(
    "PASS: migration preserves existing IDs, versions, links, immutable revisions, tombstones, counters and foreign keys; expanded kinds accepted.",
  );
} finally {
  client.close();
}
