// Applies only the reviewed migration. No credentials or source content are logged.
import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const name = "045_deliverable_generation.sql";
if (!process.env.TURSO_DATABASE_URL)
  throw Error("Database configuration is missing.");
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const watched = [
  "project_artifacts",
  "artifact_links",
  "artifact_revisions",
  "project_role_tab_permissions",
  "project_sequences",
  "ai_conversations",
  "ai_prompt_chats",
  "ai_chat_images",
  "architecture_images",
  "planning_boards",
  "planning_board_revisions",
];
try {
  await db.execute("PRAGMA foreign_keys=ON");
  const applied = (
    await db.execute({
      sql: "SELECT name FROM schema_migrations WHERE name=?",
      args: [name],
    })
  ).rows;
  if (applied.length) {
    console.log("045 already applied; no changes.");
  } else {
    assert.equal(
      (
        await db.execute(
          "SELECT COUNT(*) AS n FROM schema_migrations WHERE name='044_personal_theme_presets.sql'",
        )
      ).rows[0].n,
      1,
      "Apply prerequisite migrations first.",
    );
    const before = new Map();
    for (const table of watched)
      before.set(
        table,
        (await db.execute('SELECT COUNT(*) AS n FROM "' + table + '"')).rows[0]
          .n,
      );
    const sql = await readFile(
      new URL("../db/migrations/" + name, import.meta.url),
      "utf8",
    );
    const tx = await db.transaction("write");
    try {
      let buffer = "",
        quote = "",
        comment = false;
      const statements = [];
      for (let i = 0; i < sql.length; i++) {
        const c = sql[i],
          next = sql[i + 1];
        buffer += c;
        if (comment) {
          if (c === "\n") comment = false;
          continue;
        }
        if (quote) {
          if (c === quote) {
            if (next === quote) {
              buffer += next;
              i++;
            } else quote = "";
          }
          continue;
        }
        if (c === "-" && next === "-") {
          buffer += next;
          i++;
          comment = true;
          continue;
        }
        if (c === "'" || c === '"') {
          quote = c;
          continue;
        }
        if (c === ";") {
          if (/CREATE\s+TRIGGER/i.test(buffer) && !/\bEND;\s*$/i.test(buffer))
            continue;
          statements.push(buffer);
          buffer = "";
        }
      }
      if (buffer.trim()) statements.push(buffer);
      for (let index = 0; index < statements.length; index++) {
        try {
          await tx.execute(statements[index]);
        } catch (e) {
          console.error(
            "Migration statement failed:",
            index + 1,
            statements[index]
              .replace(/--[^\n]*/g, "")
              .trim()
              .split(/\s+/)
              .slice(0, 4)
              .join(" "),
          );
          throw e;
        }
      }
      for (const table of watched) {
        const n = (
          await tx.execute('SELECT COUNT(*) AS n FROM "' + table + '"')
        ).rows[0].n;
        assert.ok(
          table === "project_role_tab_permissions"
            ? n >= before.get(table)
            : n === before.get(table),
          "Preservation check failed: " + table,
        );
      }
      assert.deepEqual((await tx.execute("PRAGMA foreign_key_check")).rows, []);
      await tx.execute({
        sql: "INSERT INTO schema_migrations(name) VALUES (?)",
        args: [name],
      });
      await tx.commit();
      console.log(
        "045 applied; existing table counts and all foreign keys verified.",
      );
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
  }
} finally {
  db.close();
}
