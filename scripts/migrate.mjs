import { createClient } from "@libsql/client";
import { readFile, readdir } from "node:fs/promises";
if (!process.env.TURSO_DATABASE_URL)
  throw new Error("TURSO_DATABASE_URL is required");
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
  for (const name of migrations) {
    const applied = await db.execute({
      sql: "SELECT name FROM schema_migrations WHERE name=?",
      args: [name],
    });
    if (applied.rows.length) continue;
    const sql = (await readFile(new URL(name, directory), "utf8")).replace(/^\uFEFF/, "");
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
