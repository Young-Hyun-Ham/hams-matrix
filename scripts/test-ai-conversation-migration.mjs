import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const folder = await mkdtemp(join(tmpdir(), "matrix-conversation-migration-"));
const client = createClient({
  url: pathToFileURL(join(folder, "migration.db")).href,
});
try {
  await client.executeMultiple(
    "CREATE TABLE workspaces(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE projects(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES ('w'); INSERT INTO users VALUES ('u'); INSERT INTO projects VALUES ('p');",
  );
  for (const name of ["007_ai_prompt_chats.sql", "008_ai_chat_images.sql"])
    await client.executeMultiple(
      await readFile(`db/migrations/${name}`, "utf8"),
    );
  await client.executeMultiple(
    "INSERT INTO ai_prompt_chats(id,workspace_id,user_id,project_id,pathname,screen_title,prompt,model,result) VALUES ('legacy','w','u','p','/projects/p','화면 설계','기존 화면 요청','test-model','기존 답변'),('common','w','u',NULL,'/dashboard','대시보드','공통 요청','test-model','공통 답변');",
  );
  await client.executeMultiple(
    "INSERT INTO ai_chat_images(id,chat_id,workspace_id,user_id,position,mime_type,byte_length,width,height,key_id,iv_base64,tag_base64,ciphertext_base64) VALUES ('capture','legacy','w','u',0,'image/png',64,1,1,'unchanged-key','unchanged-iv','unchanged-tag','encrypted-base64');",
  );
  const chats = (
    await client.execute("SELECT * FROM ai_prompt_chats ORDER BY id")
  ).rows;
  const image = (await client.execute("SELECT * FROM ai_chat_images")).rows[0];
  await client.executeMultiple(
    await readFile("db/migrations/009_ai_conversations.sql", "utf8"),
  );
  assert.deepEqual(
    (await client.execute("SELECT * FROM ai_chat_images")).rows[0],
    image,
  );
  const migrated = (
    await client.execute("SELECT * FROM ai_prompt_chats ORDER BY id")
  ).rows;
  assert.deepEqual(
    migrated.map((row) =>
      Object.fromEntries(
        Object.entries(row).filter(([key]) => key !== "conv_id"),
      ),
    ),
    chats,
  );
  assert.deepEqual(
    migrated.map((row) => row.conv_id),
    chats.map((row) => row.id),
  );
  assert.equal(
    (await client.execute("SELECT count(*) AS n FROM ai_conversations")).rows[0]
      .n,
    2,
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  await client.executeMultiple(
    await readFile("db/migrations/010_ai_conversation_options.sql", "utf8"),
  );
  assert.ok(
    (await client.execute("SELECT is_pinned FROM ai_conversations")).rows.every(
      (row) => Number(row.is_pinned) === 0,
    ),
  );
  await assert.rejects(
    client.execute(
      "UPDATE ai_prompt_chats SET conv_id='common' WHERE id='legacy'",
    ),
  );
  console.log(
    "PASS: legacy chats migrate to separate rooms; project scope, message IDs and encrypted image bytes/metadata remain unchanged.",
  );
} finally {
  client.close();
}
