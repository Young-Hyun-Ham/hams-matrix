import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
import { validateClarificationMigration } from "./chatbot-clarification-migration.mjs";
const f = await dashboardFixture(new Date(), "054_chatbot_storage.sql"),
  db = f.db;
let checks = 0;
async function snapshot() {
  const result = {};
  for (const row of (
    await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
  ).rows)
    result[row.name] = (
      await db.execute(`SELECT * FROM "${row.name}" ORDER BY rowid`)
    ).rows.map((r) => ({ ...r }));
  return JSON.stringify(result);
}
try {
  await db.executeMultiple(`
  INSERT INTO chatbot_conversations(id,workspace_id,user_id,create_request_id,create_payload_hash,title,created_at,updated_at) VALUES ('migration-room','dash-ws','dash-owner','migration-room-key','hash','room','2026-01-01','2026-01-01');
  INSERT INTO chatbot_turns(id,workspace_id,user_id,conversation_id,seq,mode,model_id,logical_request_id,status,created_at) VALUES ('migration-turn','dash-ws','dash-owner','migration-room',1,'file','synthetic','migration-request','waiting_review','2026-01-01');
  INSERT INTO chatbot_requests(id,workspace_id,user_id,conversation_id,turn_id,logical_request_id,operation,client_request_id,payload_hash,mode,model_id,status,input_ciphertext,result_ciphertext,created_at) VALUES ('migration-request','dash-ws','dash-owner','migration-room','migration-turn','migration-request','message','migration-key','hash','file','synthetic','waiting_review','encrypted-input','encrypted-result','2026-01-01');
  INSERT INTO chatbot_messages(id,workspace_id,user_id,conversation_id,turn_id,role,content_json,created_at) VALUES ('migration-message','dash-ws','dash-owner','migration-room','migration-turn','user','{"text":"synthetic original"}','2026-01-01');
  INSERT INTO chatbot_artifacts(id,workspace_id,user_id,conversation_id,kind,title,created_at) VALUES ('migration-artifact','dash-ws','dash-owner','migration-room','file','artifact','2026-01-01');
  INSERT INTO chatbot_artifact_versions(id,workspace_id,user_id,artifact_id,version_number,request_id,format,mime_type,size_bytes,sha256,storage_key,status,created_at) VALUES ('migration-version','dash-ws','dash-owner','migration-artifact',1,'migration-request','md','text/markdown',10,'hash','synthetic-key','published','2026-01-01');
  UPDATE chatbot_artifacts SET current_version_id='migration-version',version=1 WHERE id='migration-artifact';
  INSERT INTO chatbot_reviews(id,workspace_id,user_id,request_id,kind,status,payload_ciphertext,payload_hash,source_hash,policy_version,expires_at,created_at) VALUES ('migration-review','dash-ws','dash-owner','migration-request','artifact','pending','encrypted-review','hash','hash',0,'2099-01-01','2026-01-01');
  INSERT INTO chatbot_policy_events(id,workspace_id,user_id,request_id,stage,policy_version,rule_codes_json,operation_hash,created_at) VALUES ('migration-policy','dash-ws','dash-owner','migration-request','output',0,'[]','hash','2026-01-01');
  INSERT INTO chatbot_policy_approvals(id,workspace_id,user_id,request_id,event_id,status,operation_hash,policy_version,checkpoint_ciphertext,expires_at,created_at) VALUES ('migration-approval','dash-ws','dash-owner','migration-request','migration-policy','pending','hash',0,'encrypted-checkpoint','2099-01-01','2026-01-01');
  INSERT INTO chatbot_approval_events(id,workspace_id,user_id,policy_approval_id,actor_id,event_type,created_at) VALUES ('migration-audit','dash-ws','dash-owner','migration-approval','dash-owner','requested','2026-01-01');
  INSERT INTO chatbot_usage(id,workspace_id,user_id,request_id,call_index,purpose,model_id,status,created_at) VALUES ('migration-usage','dash-ws','dash-owner','migration-request',1,'generation','synthetic','completed','2026-01-01');
  `);
  const before = await snapshot();
  await validateClarificationMigration(db);
  checks++;
  const sql = await readFile(
    "db/migrations/055_chatbot_clarifications.sql",
    "utf8",
  );
  await assert.rejects(() =>
    db.executeMultiple(
      "BEGIN IMMEDIATE;\n" +
        sql.replace(
          "INSERT INTO chatbot_usage SELECT * FROM _clarification_backup_chatbot_usage;",
          "",
        ) +
        "\nCOMMIT;",
    ),
  );
  assert.equal(await snapshot(), before);
  checks++;
  await db.executeMultiple("BEGIN IMMEDIATE;\n" + sql + "\nCOMMIT;");
  const after = JSON.parse(await snapshot());
  for (const name of [
    "chatbot_clarifications",
    "chatbot_clarification_events",
    "chatbot_request_steps",
  ])
    delete after[name];
  assert.equal(JSON.stringify(after), before);
  checks++;
  await db.execute(
    "UPDATE chatbot_requests SET status='waiting_clarification' WHERE id='migration-request'",
  );
  checks++;
  assert.equal((await db.execute("PRAGMA foreign_key_check")).rows.length, 0);
  assert.equal(
    (await db.execute("PRAGMA integrity_check")).rows[0].integrity_check,
    "ok",
  );
  checks++;
  await assert.rejects(() =>
    db.execute(
      "UPDATE chatbot_approval_events SET event_type='tamper' WHERE id='migration-audit'",
    ),
  );
  await assert.rejects(() =>
    db.execute(
      "UPDATE chatbot_artifact_versions SET sha256='tamper' WHERE id='migration-version'",
    ),
  );
  checks++;
  await assert.rejects(() =>
    db.execute(
      "INSERT INTO chatbot_clarifications(id,workspace_id,user_id,conversation_id,request_id,turn_id,round,field_key,intent,status,input_hash,checkpoint_hash,payload_ciphertext,expires_at,created_at) VALUES ('bad','dash-ws','dash-owner','wrong-room','migration-request','migration-turn',1,'x','x','pending','x','x','x','2099','2026')",
    ),
  );
  checks++;
  console.log(
    `Chatbot clarification migration: ${checks} checks passed; populated rows preserved, failed migration rolled back, FK/triggers intact.`,
  );
} finally {
  db.close();
}
