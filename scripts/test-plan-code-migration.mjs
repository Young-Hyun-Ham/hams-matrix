// Collision-safe upgrade and rollback against isolated SQLite. Never reads .env.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";

const folder = await mkdtemp(join(tmpdir(), "matrix-plan-codes-"));
const client = createClient({
  url: pathToFileURL(join(folder, "test.db")).href,
});
const name = "035_plan_codes_pro_team.sql";
const mapped = (code) =>
  code === "plus" ? "pro" : code === "pro" ? "team" : code;
const rows = async (sql) =>
  JSON.parse(JSON.stringify((await client.execute(sql)).rows));
const omit = (row, keys) =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => !keys.includes(key)),
  );
const state = async () => ({
  plans: await rows("SELECT * FROM plans ORDER BY code"),
  subscriptions: await rows(
    "SELECT * FROM user_subscriptions ORDER BY user_id",
  ),
  users: await rows("SELECT * FROM users ORDER BY id"),
  logs: await rows("SELECT * FROM plan_change_logs ORDER BY id"),
  quotas: await rows("SELECT * FROM quota_reservations ORDER BY id"),
  projects: await rows("SELECT * FROM projects ORDER BY id"),
  workspaces: await rows("SELECT * FROM workspaces ORDER BY id"),
  posts: await rows("SELECT * FROM team_posts ORDER BY id"),
});
try {
  await client.execute("PRAGMA foreign_keys=ON");
  for (const file of (await readdir("db/migrations"))
    .filter((file) => file.endsWith(".sql") && file < name)
    .sort())
    await client.executeMultiple(
      await readFile(join("db/migrations", file), "utf8"),
    );
  await client.executeMultiple(`
    CREATE TABLE schema_migrations(name TEXT PRIMARY KEY);
    INSERT INTO users(id,name) VALUES ('u-free','Free'),('u-plus','Plus'),('u-pro','Pro'),('u-business','Business'),('no-sub','No subscription');
    UPDATE user_subscriptions SET plan_code='plus',billing_cycle='yearly',updated_by='u-free' WHERE user_id='u-plus';
    UPDATE user_subscriptions SET plan_code='pro' WHERE user_id='u-pro';
    UPDATE user_subscriptions SET plan_code='business',billing_cycle='contract' WHERE user_id='u-business';
    DELETE FROM user_subscriptions WHERE user_id='no-sub';
    UPDATE plans SET monthly_price=12345,monthly_discount_price=10000,yearly_price=120000,yearly_discount_price=99000,version=99,team_sharing_enabled=1,updated_by='u-plus' WHERE code='plus';
    UPDATE plans SET version=7,team_sharing_enabled=0,updated_by='u-pro' WHERE code='pro';
    INSERT INTO workspaces(id,name,owner_id,plan,subscription_plan) VALUES ('ws','Legacy workspace','u-pro','pro','team');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','u-pro','owner');
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','ws','Preserved','u-pro','u-pro');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('p','ws','u-pro','admin');
    INSERT INTO team_posts(id,workspace_id,project_id,author_id,title,body,category,created_at) VALUES ('post','ws','p','u-pro','Keep','Body','공유','2026-11-05');
    INSERT INTO quota_reservations(id,user_id,resource,period,reserved,actual,status,policy_version) VALUES ('quota','u-plus','tokens','total',30,30,'settled',99);
    INSERT INTO plan_change_logs(id,actor_id,resource,resource_id,before_json,after_json) VALUES ('log','u-free','plan','pro','{"code":"plus"}','{"code":"pro"}');
  `);
  const sql = await readFile(join("db/migrations", name), "utf8");
  const before = await state();
  // Prove the destructive-looking table replacement is fully transactional.
  let tx = await client.transaction("write");
  try {
    await tx.executeMultiple(sql);
    await tx.rollback();
  } finally {
    tx.close();
  }
  assert.deepEqual(await state(), before);
  assert.equal((await rows("PRAGMA foreign_key_check")).length, 0);
  async function migrate() {
    const tx = await client.transaction("write");
    try {
      const applied = (
        await tx.execute({
          sql: "SELECT name FROM schema_migrations WHERE name=?",
          args: [name],
        })
      ).rows.length;
      if (!applied) {
        await tx.executeMultiple(sql);
        await tx.execute({
          sql: "INSERT INTO schema_migrations(name) VALUES (?)",
          args: [name],
        });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }
  await migrate();
  const after = await state();
  assert.deepEqual(
    after.plans.map((plan) => plan.code),
    ["business", "free", "pro", "team"],
  );
  for (const oldPlan of before.plans) {
    const plan = after.plans.find((plan) => plan.code === mapped(oldPlan.code));
    assert.deepEqual(
      omit(plan, ["code", "version", "updated_at"]),
      omit(oldPlan, ["code", "version", "updated_at"]),
    );
    assert(
      plan.version > Math.max(...before.plans.map((plan) => plan.version)),
      "Every old catalog version must be rejected",
    );
  }
  assert.deepEqual(
    after.subscriptions,
    before.subscriptions.map((row) => ({
      ...row,
      plan_code: mapped(row.plan_code),
    })),
  );
  assert.deepEqual(
    after.users,
    before.users.map((row) => ({
      ...row,
      management_version: row.management_version + 1,
    })),
  );
  for (const key of ["logs", "quotas", "projects", "workspaces", "posts"])
    assert.deepEqual(after[key], before[key]);
  const fks = await rows("PRAGMA foreign_key_list(user_subscriptions)");
  assert(fks.some((fk) => fk.from === "plan_code" && fk.table === "plans"));
  assert(
    (await rows("PRAGMA index_list(user_subscriptions)")).some(
      (index) => index.name === "idx_subscriptions_plan",
    ),
  );
  await assert.rejects(
    client.execute(
      "UPDATE user_subscriptions SET plan_code='plus' WHERE user_id='u-free'",
    ),
  );
  await assert.rejects(
    client.execute(
      "INSERT INTO plans(code,name,attachment_limit,history_enabled) VALUES ('plus','Invalid',1,0)",
    ),
  );
  await assert.rejects(
    client.execute("UPDATE plans SET team_sharing_enabled=2 WHERE code='pro'"),
  );
  await assert.rejects(
    client.execute(
      "UPDATE plans SET monthly_discount_price=monthly_price WHERE code='pro'",
    ),
  );
  await migrate();
  assert.deepEqual(
    await state(),
    after,
    "Recorded migration must not run twice",
  );
  await client.execute(
    "INSERT INTO users(id,name) VALUES ('new-user','New user')",
  );
  assert.deepEqual(
    (
      await rows(
        "SELECT plan_code FROM user_subscriptions WHERE user_id='new-user'",
      )
    ).map((row) => row.plan_code),
    ["free"],
  );
  assert.equal((await rows("PRAGMA foreign_key_check")).length, 0);
  console.log(
    "PASS: rollback/commit/idempotency; plus->pro and pro->team mapping; custom prices/flags/billing/metadata preserved; all stale versions invalidated; quota/history/legacy workspace preserved; FK/CHECK/index/default trigger retained.",
  );
} finally {
  client.close();
}
