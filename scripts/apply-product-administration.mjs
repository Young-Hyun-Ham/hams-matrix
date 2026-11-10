// Apply only 041 and verify that existing accounts, spaces and project owners survive.
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
const name = "041_product_administration.sql";
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const snapshot = async (tx) =>
  JSON.stringify(
    await Promise.all(
      [
        "SELECT id,account_role FROM users ORDER BY id",
        "SELECT id,owner_id,plan,subscription_plan FROM workspaces ORDER BY id",
        "SELECT id,owner_id FROM projects ORDER BY id",
        "SELECT user_id,plan_code FROM user_subscriptions ORDER BY user_id",
      ].map(async (sql) => (await tx.execute(sql)).rows),
    ),
  );
try {
  const tx = await client.transaction("write");
  try {
    if (
      !(
        await tx.execute(
          "SELECT name FROM schema_migrations WHERE name='040_workspace_plan_policy.sql'",
        )
      ).rows.length
    )
      throw new Error("Prerequisite 040 is missing");
    const applied = (
      await tx.execute({
        sql: "SELECT name FROM schema_migrations WHERE name=?",
        args: [name],
      })
    ).rows.length;
    const before = await snapshot(tx);
    if (!applied) {
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
    if (before !== (await snapshot(tx)))
      throw new Error("Existing account/plan/ownership data changed");
    if ((await tx.execute("PRAGMA foreign_key_check")).rows.length)
      throw new Error("Foreign key check failed");
    const integrity = (await tx.execute("PRAGMA integrity_check")).rows;
    if (integrity.some((row) => Object.values(row)[0] !== "ok"))
      throw new Error("Integrity check failed");
    const counts = (
      await tx.execute(
        "SELECT account_role,count(*) AS count FROM users GROUP BY account_role ORDER BY account_role",
      )
    ).rows;
    await tx.commit();
    console.log(
      JSON.stringify({
        migration: name,
        applied: !applied,
        existingDataPreserved: true,
        foreignKeysValid: true,
        integrityValid: true,
        roles: counts,
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
