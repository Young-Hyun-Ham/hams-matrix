import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
const name = "039_database_erd_images.sql";
if (!process.env.TURSO_DATABASE_URL)
  throw new Error("Database is not configured");
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
let tx;
try {
  tx = await client.transaction("write");
  const applied = await tx.execute({
    sql: "SELECT name FROM schema_migrations WHERE name=?",
    args: [name],
  });
  const existing = await tx.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('database_erd_images','database_erd_image_generations')",
  );
  if (applied.rows.length) {
    if (existing.rows.length !== 2)
      throw new Error("Migration record and schema do not match");
    console.log("ERD image migration already applied.");
  } else {
    if (existing.rows.length)
      throw new Error("ERD image tables exist without a migration record");
    const before = await tx.execute(
      "SELECT COUNT(*) AS n FROM project_artifacts",
    );
    const sql = await readFile(
      new URL(`../db/migrations/${name}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await tx.execute(statement);
    const after = await tx.execute(
      "SELECT COUNT(*) AS n FROM project_artifacts",
    );
    if (before.rows[0].n !== after.rows[0].n)
      throw new Error("Existing artifact count changed");
    await tx.execute({
      sql: "INSERT INTO schema_migrations(name) VALUES (?)",
      args: [name],
    });
    console.log(
      "ERD image storage tables created; existing artifacts preserved.",
    );
  }
  await tx.commit();
} catch {
  if (tx) await tx.rollback();
  console.error(
    "ERD image migration failed; transaction rolled back. Inspect schema before retrying.",
  );
  process.exitCode = 1;
} finally {
  tx?.close();
  client.close();
}
