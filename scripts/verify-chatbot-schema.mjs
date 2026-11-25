// Read-only schema/integrity verification. Run with --env-file=.env against the configured DB.
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const file = new URL(
  "../.auth-tests/chatbot-db-baseline.json",
  import.meta.url,
);
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function snapshot() {
  const objects = (
    await client.execute(
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name NOT LIKE 'chatbot_%' AND name NOT LIKE 'chatbot_%' ORDER BY type,name",
    )
  ).rows.map((r) => ({ ...r }));
  const tables = (
    await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'ai_%' OR name LIKE 'builder_%' OR name IN ('users','workspaces','workspace_members','projects','user_preferences')) ORDER BY name",
    )
  ).rows;
  const counts = {};
  for (const table of tables)
    counts[table.name] = Number(
      (
        await client.execute(
          `SELECT COUNT(*) AS n FROM "${String(table.name).replaceAll('"', '""')}"`,
        )
      ).rows[0].n,
    );
  return { schemaHash: digest(objects), counts };
}
try {
  const current = await snapshot();
  if (process.argv.includes("--before")) {
    await mkdir(new URL("../.auth-tests/", import.meta.url), {
      recursive: true,
    });
    await writeFile(file, JSON.stringify(current));
    console.log("Configured DB baseline saved (schema hash and counts only).");
  } else {
    const baseline = JSON.parse(await readFile(file, "utf8"));
    if (JSON.stringify(current) !== JSON.stringify(baseline))
      throw Error("Existing schema or row counts changed");
    const tables = (
      await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'chatbot_%' ORDER BY name",
      )
    ).rows;
    const hasClarificationMigration=(await client.execute("SELECT name FROM schema_migrations WHERE name='055_chatbot_clarifications.sql'")).rows.length>0;
    const expectedTables=hasClarificationMigration?19:16;
    if (tables.length !== expectedTables) throw Error("Unexpected independent chatbot table count");
    if ((await client.execute("PRAGMA foreign_key_check")).rows.length)
      throw Error("Foreign key violation");
    if (
      (await client.execute("PRAGMA integrity_check")).rows[0]
        .integrity_check !== "ok"
    )
      throw Error("Integrity check failed");
    const migration = (
      await client.execute(
        "SELECT name FROM schema_migrations WHERE name='054_chatbot_storage.sql'",
      )
    ).rows;
    if (!migration.length) throw Error("Migration 054 is not recorded");
    console.log(
      `Configured DB verified: ${expectedTables} chatbot tables; existing schema/counts preserved; foreign keys/integrity OK.`,
    );
  }
} finally {
  client.close();
}
