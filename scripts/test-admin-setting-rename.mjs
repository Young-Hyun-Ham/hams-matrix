import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { readFile, readdir } from 'node:fs/promises';
const db = createClient({ url: 'file::memory:' });
try {
  await db.execute('PRAGMA foreign_keys=ON');
  for (const name of (await readdir('db/migrations')).filter(n => n.endsWith('.sql') && n < '029').sort()) {
    await db.executeMultiple(await readFile(`db/migrations/${name}`, 'utf8'));
  }
  await db.execute("INSERT INTO users(id,name) VALUES ('rename-test','Rename test')");
  await db.execute("UPDATE app_settings SET value_json='true',version=7,updated_by='rename-test' WHERE setting_key='DB_LOGGING_ENABLED'");
  await db.execute(`INSERT INTO app_settings(setting_key,value_json,value_type,label) VALUES ('CUSTOM','{"preserve":true}','json','Preserve')`);
  const rows = (await db.execute('SELECT * FROM app_settings ORDER BY setting_key')).rows;
  const columns = (await db.execute('PRAGMA table_info(app_settings)')).rows;
  const indexes = (await db.execute('PRAGMA index_list(app_settings)')).rows;
  await db.executeMultiple('BEGIN IMMEDIATE;\n' + await readFile('db/migrations/029_rename_admin_setting.sql','utf8') + '\nCOMMIT;');
  assert.deepEqual((await db.execute('SELECT * FROM admin_setting ORDER BY setting_key')).rows, rows);
  assert.deepEqual((await db.execute('PRAGMA table_info(admin_setting)')).rows, columns);
  assert.equal((await db.execute('PRAGMA index_list(admin_setting)')).rows.length, indexes.length);
  assert.equal((await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'")).rows.length,0);
  assert.deepEqual((await db.execute('PRAGMA foreign_key_check')).rows,[]);
  await assert.rejects(db.execute("UPDATE admin_setting SET value_json='123' WHERE setting_key='DB_LOGGING_ENABLED'"));
  await assert.rejects(db.execute("UPDATE admin_setting SET updated_by='missing-user' WHERE setting_key='DB_LOGGING_ENABLED'"));
  console.log('PASS: rename preserves all rows, columns, indexes, foreign keys and JSON type constraints; old table removed.');
} finally { db.close(); }
