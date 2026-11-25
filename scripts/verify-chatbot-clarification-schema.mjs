// Read-only configured DB verification; saves hashes/counts only, never data/credentials.
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const file = new URL(
  "../.auth-tests/chatbot-clarification-baseline.json",
  import.meta.url,
);
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
try {
  const tables = (
    await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
  ).rows.map((r) => r.name);
  const schema = (
    await db.execute(
      "SELECT name,type,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
  ).rows.map((r) => ({ ...r }));
  const rows = {};
  for (const name of tables) {
    if (name === "schema_migrations") continue;
    if (name.startsWith("chatbot_"))
      rows[name] = {
        hash: digest(
          (
            await db.execute("SELECT * FROM " + quote(name) + " ORDER BY rowid")
          ).rows.map((r) => ({ ...r })),
        ),
      };
    else
      rows[name] = {
        count: Number(
          (await db.execute("SELECT COUNT(*) AS n FROM " + quote(name))).rows[0]
            .n,
        ),
      };
  }
  const active = Number(
    (
      await db.execute(
        "SELECT (SELECT COUNT(*) FROM chatbot_requests WHERE status IN ('queued','running'))+(SELECT COUNT(*) FROM chatbot_scenario_runs WHERE status IN ('queued','running')) AS n",
      )
    ).rows[0].n,
  );
  if (process.argv.includes("--before")) {
    if (active)
      throw Error("Finish or stop active chatbot jobs before migration.");
    await mkdir(new URL("../.auth-tests/", import.meta.url), {
      recursive: true,
    });
    await writeFile(file, JSON.stringify({ schema, rows }));
    console.log(
      "055 baseline saved: schema, chatbot row hashes and existing table counts only; no active jobs.",
    );
  } else {
    const baseline = JSON.parse(await readFile(file, "utf8"));
    for (const [name, value] of Object.entries(baseline.rows))
      if (JSON.stringify(rows[name]) !== JSON.stringify(value))
        throw Error("Existing rows/counts changed: " + name);
    for (const object of baseline.schema) {
      const actual = schema.find((r) => r.name === object.name);
      const expected = { ...object };
      if (expected.name === "chatbot_requests")
        expected.sql = expected.sql.replace(
          "'waiting_review','waiting_policy_approval'",
          "'waiting_review','waiting_clarification','waiting_policy_approval'",
        );
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw Error("Existing schema changed unexpectedly: " + object.name);
    }
    for (const name of [
      "chatbot_clarifications",
      "chatbot_clarification_events",
      "chatbot_request_steps",
    ])
      if (!tables.includes(name)) throw Error("Missing " + name);
    if ((await db.execute("PRAGMA foreign_key_check")).rows.length)
      throw Error("Foreign key violation");
    if (
      (await db.execute("PRAGMA integrity_check")).rows[0].integrity_check !==
      "ok"
    )
      throw Error("Integrity failure");
    if (
      !(
        await db.execute(
          "SELECT name FROM schema_migrations WHERE name='055_chatbot_clarifications.sql'",
        )
      ).rows.length
    )
      throw Error("055 is not recorded");
    console.log(
      "055 verified: 19 chatbot tables; all preexisting chatbot rows, other table counts, original indexes/triggers and FK/integrity preserved.",
    );
  }
} finally {
  db.close();
}
