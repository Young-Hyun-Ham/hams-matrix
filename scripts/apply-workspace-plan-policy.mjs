// Apply only the requested workspace policy migration, never unrelated changes.
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
const name = "040_workspace_plan_policy.sql";
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  const tx = await client.transaction("write");
  try {
    if (
      !(
        await tx.execute(
          "SELECT name FROM schema_migrations WHERE name='039_database_erd_images.sql'",
        )
      ).rows.length
    )
      throw new Error("Apply prerequisite migrations through 039 first");
    const applied = (
      await tx.execute({
        sql: "SELECT name FROM schema_migrations WHERE name=?",
        args: [name],
      })
    ).rows.length;
    if (!applied) {
      const missing = (
        await tx.execute(
          "SELECT w.id FROM workspaces w LEFT JOIN user_subscriptions s ON s.user_id=w.owner_id WHERE s.plan_code IS NULL",
        )
      ).rows;
      if (missing.length)
        throw new Error(
          `${missing.length} workspaces have no owner subscription; resolve them before backfill`,
        );
      await tx.executeMultiple(
        await readFile(
          new URL(`../db/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
      await tx.execute({
        sql: "INSERT INTO schema_migrations(name) VALUES (?)",
        args: [name],
      });
    }
    const invalid = (
      await tx.execute(
        "SELECT id FROM workspaces WHERE plan!=subscription_plan OR plan NOT IN ('free','pro','team','business')",
      )
    ).rows;
    if (
      invalid.length ||
      (await tx.execute("PRAGMA foreign_key_check")).rows.length
    )
      throw new Error("Workspace plan integrity check failed");
    if (
      !applied &&
      (
        await tx.execute(
          "SELECT w.id FROM workspaces w JOIN user_subscriptions s ON s.user_id=w.owner_id WHERE w.plan!=s.plan_code",
        )
      ).rows.length
    )
      throw new Error("Owner subscription backfill check failed");
    const counts = (
      await tx.execute(
        "SELECT plan,count(*) AS count FROM workspaces GROUP BY plan ORDER BY plan",
      )
    ).rows;
    await tx.commit();
    console.log(
      JSON.stringify({
        migration: name,
        applied: !applied,
        workspaces: counts,
        foreignKeysValid: true,
      }),
    );
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
} finally {
  client.close();
}
