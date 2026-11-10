import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const folder = await mkdtemp(join(tmpdir(), "matrix-target-migration-"));
const url = pathToFileURL(join(folder, "migration.db")).href;
let client = createClient({ url });
const migration = "036_ai_conversation_targets.sql";
try {
  await client.execute("PRAGMA foreign_keys=ON");
  await client.execute("CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  for (const name of (await readdir("db/migrations")).filter(name => name.endsWith(".sql") && name < migration).sort()) {
    await client.executeMultiple((await readFile(join("db/migrations", name), "utf8")).replace(/^\uFEFF/, ""));
    await client.execute({ sql: "INSERT INTO schema_migrations(name) VALUES (?)", args: [name] });
  }
  await client.executeMultiple(`INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('u','Synthetic owner','user',1);
    INSERT INTO workspaces(id,name,owner_id) VALUES ('w','Synthetic workspace','u');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('w','u','owner');
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','w','Synthetic project','u','u');`);
  const roomIds = ["latest", "legacy", "unsupported", "empty", "invalid", "common"];
  for (const id of roomIds) await client.execute({ sql: "INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,created_at,updated_at,is_pinned) VALUES (?,'w','u',?,?,'same-time','same-time',1)", args: [id, id === "common" ? null : "p", `Room ${id}`] });
  const messages = [
    ["first", "latest", "p", "/projects/p", "screen"],
    ["second", "latest", "p", "/projects/p", "wbs"],
    ["legacy-first", "legacy", "p", "/specifications", null],
    ["legacy-invalid", "legacy", "p", "/projects/p", "not-a-tab"],
    ["documents", "unsupported", "p", "/projects/p", "documents"],
    ["invalid", "invalid", "p", "/projects/another", "screen"],
    ["common", "common", null, "/team", null],
  ];
  for (const [id, convId, projectId, pathname, tab] of messages)
    await client.execute({ sql: "INSERT INTO ai_prompt_chats(id,workspace_id,user_id,project_id,pathname,tab,screen_title,prompt,model,result,created_at,conv_id) VALUES (?,'w','u',?,?,?,'Original label','Synthetic prompt','test-model','Synthetic response','same-time',?)", args: [id, projectId, pathname, tab, convId] });
  await client.executeMultiple("INSERT INTO ai_chat_images(id,chat_id,workspace_id,user_id,position,mime_type,byte_length,width,height,key_id,iv_base64,tag_base64,ciphertext_base64) VALUES ('img','first','w','u',0,'image/png',64,1,1,'unchanged-key','unchanged-iv','unchanged-tag','unchanged-ciphertext')");
  const oldChats = (await client.execute("SELECT * FROM ai_prompt_chats ORDER BY rowid")).rows;
  const oldImages = (await client.execute("SELECT * FROM ai_chat_images")).rows;
  const oldRooms = (await client.execute("SELECT * FROM ai_conversations ORDER BY conv_id")).rows;
  client.close();
  for (let pass = 0; pass < 2; pass++) {
    const result = spawnSync(process.execPath, [resolve("scripts/migrate.mjs")], { windowsHide: true, encoding: "utf8", env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "" } });
    assert.equal(result.status, 0, result.stderr);
  }
  client = createClient({ url });
  const rooms = (await client.execute("SELECT * FROM ai_conversations ORDER BY conv_id")).rows;
  assert.deepEqual(Object.fromEntries(rooms.map(row => [row.conv_id, [row.target_page, row.target_version]])), {
    common: ["team", 1], empty: [null, 0], invalid: [null, 0], latest: ["wbs", 1], legacy: ["program", 1], unsupported: ["documents", 1],
  });
  const strip = (rows) => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !["target_page", "target_version"].includes(key))));
  assert.deepEqual(strip(rooms), oldRooms);
  assert.deepEqual(strip((await client.execute("SELECT * FROM ai_prompt_chats ORDER BY rowid")).rows), oldChats);
  assert.deepEqual((await client.execute("SELECT * FROM ai_chat_images")).rows, oldImages);
  assert.equal((await client.execute({ sql: "SELECT name FROM schema_migrations WHERE name=?", args: [migration] })).rows.length, 1);
  assert.equal((await client.execute("PRAGMA foreign_key_check")).rows.length, 0);
  await assert.rejects(client.execute("UPDATE ai_conversations SET target_page='team' WHERE conv_id='latest'"));
  await assert.rejects(client.execute("UPDATE ai_conversations SET target_page='database' WHERE conv_id='common'"));
  await assert.rejects(client.execute("UPDATE ai_conversations SET target_version=1.5 WHERE conv_id='latest'"));
  console.log("PASS target migration: latest rowid/legacy/missing/unsupported locations, original message/image/room preservation, scope constraints, foreign keys and repeated migration runner.");
} finally { client.close(); }
