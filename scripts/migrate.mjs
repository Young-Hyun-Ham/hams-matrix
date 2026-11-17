import { createClient } from "@libsql/client";
import { readFile, readdir } from "node:fs/promises";
if (!process.env.TURSO_DATABASE_URL)
  throw new Error("TURSO_DATABASE_URL is required");
const argumentsList = process.argv.slice(2).filter((value) => value !== "--");
if (
  argumentsList.length &&
  (argumentsList.length !== 2 ||
    argumentsList[0] !== "--only" ||
    !/^[0-9]{3}_[a-z0-9_]+\.sql$/.test(argumentsList[1]))
)
  throw new Error("Usage: migrate.mjs [--only migration.sql]");
const selected = argumentsList[1];
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  await db.execute("PRAGMA foreign_keys=ON");
  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  const directory = new URL("../db/migrations/", import.meta.url);
  const migrations = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (selected && !migrations.includes(selected))
    throw new Error("Selected migration not found");
  if (selected === "046_ai_project_analysis_reviews.sql") {
    const prerequisite = await db.execute({
      sql: "SELECT name FROM schema_migrations WHERE name=?",
      args: ["045_deliverable_generation.sql"],
    });
    if (!prerequisite.rows.length)
      throw new Error("Migration 046 requires applied migration 045");
  }
  if (selected === "048_project_rag_orchestration.sql") {
    const prerequisite = await db.execute({
      sql: "SELECT name FROM schema_migrations WHERE name=?",
      args: ["047_notification_acknowledgements.sql"],
    });
    if (!prerequisite.rows.length)
      throw new Error("Migration 048 requires applied migration 047");
  }
  if (selected === "049_project_rag_resume.sql") {
    const prerequisite = await db.execute({
      sql: "SELECT name FROM schema_migrations WHERE name=?",
      args: ["048_project_rag_orchestration.sql"],
    });
    if (!prerequisite.rows.length)
      throw new Error("Migration 049 requires applied migration 048");
  }
  if (selected === "050_project_shared_answers.sql") {
    const prerequisite = await db.execute({
      sql: "SELECT name FROM schema_migrations WHERE name=?",
      args: ["049_project_rag_resume.sql"],
    });
    if (!prerequisite.rows.length)
      throw new Error("Migration 050 requires applied migration 049");
  }
  for (const name of migrations) {
    if (selected && name !== selected) continue;
    const applied = await db.execute({
      sql: "SELECT name FROM schema_migrations WHERE name=?",
      args: [name],
    });
    if (applied.rows.length) continue;
    const sql = (await readFile(new URL(name, directory), "utf8")).replace(
      /^\uFEFF/,
      "",
    );
    await db.executeMultiple(
      `BEGIN IMMEDIATE;\n${sql}\nINSERT INTO schema_migrations(name) VALUES ('${name.replaceAll("'", "''")}');\nCOMMIT;`,
    );
  }
  console.log(
    "Identity, audit, project and integrated deliverable schemas ready.",
  );
} finally {
  db.close();
}
