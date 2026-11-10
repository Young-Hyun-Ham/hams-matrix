import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";

// Apply only this additive migration; do not run unrelated pending migrations.
const name = "038_database_domain_database_type.sql";
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
  const columns = await tx.execute(
    "PRAGMA table_info(project_database_domains)",
  );
  const exists = columns.rows.some((row) => row.name === "database_type");
  if (applied.rows.length) {
    if (!exists) throw new Error("Migration record and schema do not match");
    console.log("Domain database type migration already applied.");
  } else {
    if (exists)
      throw new Error(
        "Column already exists without migration record; inspect before retrying",
      );
    const before = await tx.execute(
      "SELECT id,logical_name,physical_name,data_type,length AS domain_length,version FROM project_database_domains ORDER BY id",
    );
    await tx.execute(
      await readFile(
        new URL(`../db/migrations/${name}`, import.meta.url),
        "utf8",
      ),
    );
    const after = await tx.execute(
      "SELECT id,logical_name,physical_name,data_type,length AS domain_length,version FROM project_database_domains ORDER BY id",
    );
    if (JSON.stringify(before.rows) !== JSON.stringify(after.rows))
      throw new Error("Existing domain metadata changed unexpectedly");
    const invalid = await tx.execute(
      "SELECT COUNT(*) AS n FROM project_database_domains WHERE database_type IS NOT NULL",
    );
    if (Number(invalid.rows[0].n))
      throw new Error("Legacy database type values must remain unspecified");
    await tx.execute({
      sql: "INSERT INTO schema_migrations(name) VALUES (?)",
      args: [name],
    });
    console.log(
      "Domain database type migration applied; existing metadata preserved.",
    );
  }
  await tx.commit();
} catch (error) {
  if (tx) await tx.rollback();
  // Avoid printing connection details or credentials in raw provider errors.
  console.error(
    error instanceof Error && !error.message.includes("://")
      ? error.message
      : "Domain database type migration failed.",
  );
  process.exitCode = 1;
} finally {
  tx?.close();
  client.close();
}
