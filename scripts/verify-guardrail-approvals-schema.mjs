// Read-only schema/integrity checks. No rows or connection details are printed.
import { createClient } from "@libsql/client";
if (!process.env.TURSO_DATABASE_URL)
  throw Error("Database configuration required");
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  const migration = await db.execute({
    sql: "SELECT name FROM schema_migrations WHERE name=?",
    args: ["052_ai_conversation_turns.sql"],
  });
  const tables = await db.execute({
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN (?,?,?)",
    args: [
      "ai_guardrail_approvals",
      "ai_guardrail_approval_events",
      "ai_conversation_turns",
    ],
  });
  const keys = await db.execute("PRAGMA foreign_key_check");
  const columns = await db.execute("PRAGMA table_info(ai_guardrail_approvals)");
  const valid =
    migration.rows.length === 1 &&
    tables.rows.length === 3 &&
    !keys.rows.length &&
    [
      "logical_request_id",
      "lease_until",
      "checkpoint_hash",
      "turn_id",
      "context_version",
    ].every((name) => columns.rows.some((row) => row.name === name));
  const encoded = process.env.AI_IMAGE_ENCRYPTION_KEY?.trim() ?? "",
    key = Buffer.from(encoded, "base64");
  const unlinked = await db.execute(
    "SELECT COUNT(*) AS n FROM ai_prompt_chats c LEFT JOIN ai_conversation_turns t ON t.final_chat_id=c.id WHERE t.turn_id IS NULL",
  );
  const scope = await db.execute(
    "SELECT COUNT(*) AS n FROM ai_conversation_turns t JOIN ai_prompt_chats c ON c.id=t.final_chat_id WHERE t.workspace_id!=c.workspace_id OR t.user_id!=c.user_id OR t.conv_id!=c.conv_id OR t.project_id IS NOT c.project_id",
  );
  const duplicates = await db.execute(
    "SELECT COUNT(*) AS n FROM (SELECT workspace_id,user_id,logical_request_id FROM ai_guardrail_approvals WHERE status IN ('awaiting_choice','pending','approved','resuming') GROUP BY workspace_id,user_id,logical_request_id HAVING COUNT(*)>1)",
  );
  console.log(
    JSON.stringify({
      migrationApplied: migration.rows.length === 1,
      approvalTables: tables.rows.length,
      foreignKeyViolations: keys.rows.length,
      expectedColumns: valid,
      unlinkedCompletedChats: Number(unlinked.rows[0].n),
      turnScopeViolations: Number(scope.rows[0].n),
      duplicateActiveRequests: Number(duplicates.rows[0].n),
      checkpointEncryptionConfigured:
        key.length === 32 && key.toString("base64") === encoded,
    }),
  );
  if (
    !valid ||
    Number(unlinked.rows[0].n) ||
    Number(scope.rows[0].n) ||
    Number(duplicates.rows[0].n)
  )
    process.exitCode = 1;
} finally {
  db.close();
}
