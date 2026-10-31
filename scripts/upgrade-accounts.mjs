import { createClient } from "@libsql/client";
import { bootstrapMaster } from "./lib/bootstrap-master.mjs";
if (!process.env.MATRIX_MASTER_PASSWORD) throw new Error("MATRIX_MASTER_PASSWORD is required before changing the database");
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try {
  const renamed=(await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_setting'")).rows.length;
  const before=JSON.stringify((await db.execute(`SELECT * FROM ${renamed ? "admin_setting" : "app_settings"} ORDER BY setting_key`)).rows);
  const applied=(await db.execute("SELECT name FROM schema_migrations WHERE name='020_accounts_and_plans.sql'")).rows.length;
  if(!applied) {
    const paid=(await db.execute("SELECT w.id FROM workspaces w WHERE w.subscription_plan IN ('team','business') OR w.plan IN ('pro','business') LIMIT 1")).rows;
    if(paid.length)throw new Error("Legacy paid subscriptions require an explicit migration mapping before upgrading");
  }
  await import("./migrate.mjs");
  const result=await bootstrapMaster(db,process.env.MATRIX_MASTER_PASSWORD);
  if(JSON.stringify((await db.execute("SELECT * FROM admin_setting ORDER BY setting_key")).rows)!==before)throw new Error("admin_setting values changed unexpectedly");
  if((await db.execute("PRAGMA foreign_key_check")).rows.length)throw new Error("Foreign key violation");
  const roles=(await db.execute("SELECT account_role,count(*) AS count FROM users GROUP BY account_role")).rows;
  const plans=(await db.execute("SELECT code,monthly_price,yearly_price,project_limit,token_limit,daily_image_limit,attachment_limit,history_enabled FROM plans ORDER BY code")).rows;
  console.log(JSON.stringify({master:result,settingsUnchanged:true,foreignKeysValid:true,roles,plans},null,2));
}finally{db.close();}
