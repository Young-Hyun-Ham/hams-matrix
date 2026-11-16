// Read-only preflight: never print credentials or the database connection string.
import { createClient } from "@libsql/client";
import { readdir } from "node:fs/promises";
const target = process.env.TURSO_DATABASE_URL;
if (!target) throw new Error("Database not configured");
const database = createClient({
  url: target,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  const applied = new Set(
    (await database.execute("SELECT name FROM schema_migrations")).rows.map(
      (r) => String(r.name),
    ),
  );
  const pending = (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql") && !applied.has(n))
    .sort();
  const counts = {};
  for (const table of ["ai_conversations", "ai_prompt_chats", "ai_chat_images"])
    counts[table] = Number(
      (await database.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n,
    );
  const running = Number(
    (
      await database.execute(
        "SELECT COUNT(*) AS n FROM ai_generation_requests WHERE status IN ('running','stop_requested','finalizing') AND finished_at IS NULL AND datetime(created_at)>datetime('now','-4 minutes')",
      )
    ).rows[0].n,
  );
  console.log(
    JSON.stringify(
      {
        targetKind: target.startsWith("file:")
          ? "local-sqlite"
          : "remote-libsql",
        configuredFrom: ".env",
        pending,
        counts,
        activeGenerations: running,
        foreignKeyErrors: (await database.execute("PRAGMA foreign_key_check"))
          .rows.length,
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error("Read-only migration preflight failed", e.code ?? "unknown");
  process.exitCode = 1;
} finally {
  database.close();
}
