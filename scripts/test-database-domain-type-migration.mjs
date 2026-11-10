import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const folder = await mkdtemp(join(tmpdir(), "matrix-domain-type-migration-"));
const client = createClient({
  url: pathToFileURL(join(folder, "migration.db")).href,
});
try {
  await client.execute(
    "CREATE TABLE projects(id TEXT, workspace_id TEXT, PRIMARY KEY(id,workspace_id))",
  );
  await client.executeMultiple(
    await readFile(
      new URL("../db/migrations/037_database_domains.sql", import.meta.url),
      "utf8",
    ),
  );
  await client.execute("INSERT INTO projects VALUES ('p','w')");
  await client.execute(
    "INSERT INTO project_database_domains(id,project_id,workspace_id,logical_name,logical_key,physical_name,data_type,length,description,created_by,updated_by,created_at,updated_at) VALUES ('legacy','p','w','작업','작업','job','VARCHAR2','16','','u','u','before','before')",
  );
  const before = (
    await client.execute(
      "SELECT *,length AS domain_length FROM project_database_domains",
    )
  ).rows[0];
  await client.executeMultiple(
    await readFile(
      new URL(
        "../db/migrations/038_database_domain_database_type.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const after = (
    await client.execute(
      "SELECT *,length AS domain_length FROM project_database_domains",
    )
  ).rows[0];
  assert.equal(after.database_type, null);
  for (const key of Object.keys(before).filter((k) => Number.isNaN(Number(k))))
    assert.equal(after[key], before[key]);
  await assert.rejects(() =>
    client.execute(
      "UPDATE project_database_domains SET database_type='invalid'",
    ),
  );
  await assert.rejects(() =>
    client.execute(
      "INSERT INTO project_database_domains(id,project_id,workspace_id,logical_name,logical_key,physical_name,data_type,created_by,updated_by,created_at,updated_at,database_type) VALUES ('duplicate','p','w','작업','작업','other','TEXT','u','u','after','after','turso')",
    ),
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    "PASS domain type migration: existing row preserved, NULL default, allowed DB check, unique index and foreign keys.",
  );
} finally {
  client.close();
}
