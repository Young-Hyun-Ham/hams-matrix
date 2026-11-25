import { readFile } from "node:fs/promises";
export const replacedChatbotTables = [
  "chatbot_requests",
  "chatbot_artifact_versions",
  "chatbot_reviews",
  "chatbot_policy_events",
  "chatbot_policy_approvals",
  "chatbot_approval_events",
  "chatbot_usage",
];
const normalized = (s) => s.replace(/\s+/g, " ").replace(/;$/g, "").trim();
export async function validateClarificationMigration(client) {
  const source = await readFile(
    new URL("../db/migrations/054_chatbot_storage.sql", import.meta.url),
    "utf8",
  );
  const expected = [];
  for (const table of replacedChatbotTables)
    expected.push(
      source.match(
        new RegExp("CREATE TABLE " + table + " \\([\\s\\S]*?\\n\\);"),
      )[0],
    );
  for (const match of source.matchAll(
    /CREATE (?:UNIQUE )?INDEX [^;]+;|CREATE TRIGGER [^;]+; END;/g,
  ))
    if (
      replacedChatbotTables.some((t) =>
        new RegExp(" ON " + t + "(?:\\(| )").test(match[0]),
      )
    )
      expected.push(match[0]);
  const actual = (
    await client.execute({
      sql: `SELECT sql FROM sqlite_master WHERE tbl_name IN (${replacedChatbotTables.map(() => "?").join(",")}) AND sql IS NOT NULL ORDER BY type,name`,
      args: replacedChatbotTables,
    })
  ).rows
    .map((r) => normalized(r.sql))
    .sort();
  if (
    JSON.stringify(actual) !== JSON.stringify(expected.map(normalized).sort())
  )
    throw Error(
      "Migration 055 requires unchanged 054 request subgraph. Review custom schema before applying.",
    );
  const dependencies = (
    await client.execute(
      "SELECT DISTINCT m.name FROM sqlite_master m, pragma_foreign_key_list(m.name) f WHERE m.type='table' AND f.\"table\"='chatbot_requests'",
    )
  ).rows;
  if (dependencies.some((r) => !replacedChatbotTables.includes(r.name)))
    throw Error(
      "Migration 055 found an unexpected request dependency; review it first.",
    );
  if (
    Number(
      (
        await client.execute(
          "SELECT COUNT(*) AS n FROM chatbot_requests WHERE status IN ('queued','running')",
        )
      ).rows[0].n,
    )
  )
    throw Error(
      "Migration 055 requires no queued/running chatbot requests. Stop the chatbot worker and finish or stop active requests first.",
    );
}
