// Isolated SQLite tests for subscription mutations; never reads .env.
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@libsql/client";
const folder = await mkdtemp(join(tmpdir(), "matrix-subscription-"));
const client = createClient({
  url: pathToFileURL(join(folder, "test.db")).href,
  timeout: 5000,
});
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
let user = { id: "member", name: "Member", accountRole: "user" };
function load(source, imports) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require: (name) => {
      if (!(name in imports)) throw new Error(name);
      return imports[name];
    },
    Request,
    Response,
    URL,
    console,
  });
  return exports;
}
const auth = {
  HttpError,
  body: (request) => request.json(),
  checkOrigin: (request) => {
    if (request.headers.get("origin") !== "http://test.local")
      throw new HttpError(403, "origin");
  },
  requireUser: async () => {
    if (!user) throw new HttpError(401, "login");
    if (user.accountRole === "guest") throw new HttpError(403, "guest");
    return user;
  },
  errorResponse: (error) =>
    Response.json(
      { error: error.message, ...error.details },
      { status: error.status ?? 500 },
    ),
};
const one = async (sql, args = []) =>
  (await client.execute({ sql, args })).rows[0];
const state = async (id) => ({
  subscription: {
    ...(await one("SELECT * FROM user_subscriptions WHERE user_id=?", [id])),
  },
  account: {
    ...(await one(
      "SELECT account_role,management_version FROM users WHERE id=?",
      [id],
    )),
  },
  logs: Number(
    (
      await one(
        "SELECT count(*) AS n FROM plan_change_logs WHERE resource_id=?",
        [id],
      )
    ).n,
  ),
});
try {
  await client.execute("PRAGMA foreign_keys=ON");
  for (const file of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await client.executeMultiple(
      await readFile(join("db/migrations", file), "utf8"),
    );
  await client.executeMultiple(`
 INSERT INTO users(id,name,account_role) VALUES ('member','Member','user'),('other','Other','user'),('master','master','master');
 INSERT INTO workspaces(id,name,owner_id) VALUES ('master-ws','Master workspace','master');
 INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('master-ws','master','owner');
 INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('kept','master-ws','Preserved project','master','master');
 INSERT INTO quota_reservations(id,user_id,resource,period,reserved,status,policy_version) VALUES ('kept-usage','master','tokens','',100,'reserved',1);
 `);
  const plans = load(await readFile("lib/plans.ts", "utf8"), {
    "server-only": {},
    "./db": { db: () => client },
    "./auth": auth,
    "./plan-types": { isPlatformAdmin: () => false },
  });
  const route = load(
    await readFile("app/api/me/subscription/route.ts", "utf8"),
    {
      "node:crypto": { randomUUID },
      "@/lib/auth": auth,
      "@/lib/db": { db: () => client },
      "@/lib/plans": plans,
      "@/lib/quotas": { quotaPeriod: () => "" },
    },
  );
  const proPlan = (await plans.listPlans()).find((p) => p.code === "pro");
  const patch = (data, origin = "http://test.local") =>
    route.PATCH(
      new Request("http://test.local/api/me/subscription", {
        method: "PATCH",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    );
  const data = {
    plan: "pro",
    currentPlan: "free",
    planVersion: proPlan.version,
  };
  assert.equal((await patch(data, "http://foreign.local")).status, 403);
  const member = user;
  user = null;
  assert.equal((await patch(data)).status, 401);
  user = { ...member, accountRole: "guest" };
  assert.equal((await patch(data)).status, 403);
  user = member;
  assert.equal((await patch({ ...data, userId: "other" })).status, 400);
  assert.equal((await patch({ ...data, plan: "invalid" })).status, 400);
  assert.equal((await patch({ ...data, plan: "plus" })).status, 400);
  assert.equal(
    (await patch({ ...data, planVersion: proPlan.version + 1 })).status,
    409,
  );
  assert.equal((await patch(data)).status, 200);
  assert.equal((await plans.memberPlan("member")).code, "pro");
  assert.equal((await plans.memberPlan("other")).code, "free");
  assert.equal(
    (
      await client.execute(
        "SELECT management_version FROM users WHERE id='member'",
      )
    ).rows[0].management_version,
    2,
  );
  assert.equal((await patch(data)).status, 409);
  assert.equal((await patch({ ...data, currentPlan: "pro" })).status, 200);
  assert.equal(
    (await client.execute("SELECT COUNT(*) AS n FROM plan_change_logs")).rows[0]
      .n,
    1,
  );
  const catalog = await plans.listPlans();
  const input = (plan, currentPlan) => ({
    plan,
    currentPlan,
    planVersion: catalog.find((p) => p.code === plan).version,
  });
  const unchangedMember = await state("member");
  for (const accountRole of ["user", "admin", "biz_admin", "team_admin"])
    for (const [plan, code] of [
      ["team", "TEAM_PAYMENT_REQUIRED"],
      ["business", "BUSINESS_REQUEST_REQUIRED"],
    ]) {
      user = { ...member, accountRole, role: "owner" };
      const response = await patch(input(plan, "pro"));
      assert.equal(response.status, 409);
      assert.equal((await response.json()).code, code);
    }
  user = member;
  for (const extra of [{ role: "master" }, { accountRole: "master" }])
    assert.equal(
      (await patch({ ...input("team", "pro"), ...extra })).status,
      400,
    );
  assert.deepEqual(await state("member"), unchangedMember);
  const free = (await plans.listPlans()).find((p) => p.code === "free");
  assert.equal(
    (
      await patch({
        plan: "free",
        currentPlan: "pro",
        planVersion: free.version,
      })
    ).status,
    200,
  );
  assert.equal((await plans.memberPlan("member")).code, "free");

  user = {
    id: "master",
    name: "master",
    accountRole: "master",
    workspaceId: "master-ws",
    role: "owner",
  };
  const ancillaryTables = [
    "plan_products",
    "contracts",
    "product_members",
    "payment_orders",
    "payment_events",
    "business_requests",
    "notifications",
    "product_events",
  ];
  const ancillary = async () =>
    Promise.all(
      ancillaryTables.map(async (table) =>
        Number((await one(`SELECT count(*) AS n FROM ${table}`)).n),
      ),
    );
  const initialAncillary = await ancillary();
  const workspacesBefore = JSON.stringify(
    (await client.execute("SELECT * FROM workspaces ORDER BY id")).rows,
  );
  async function changeMaster(target) {
    const before = await state("master");
    const response = await patch(input(target, before.subscription.plan_code));
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const after = await state("master");
    const changed = before.subscription.plan_code !== target;
    assert.equal(after.subscription.plan_code, target);
    assert.equal(after.account.account_role, "master");
    assert.equal(after.subscription.product_id, null);
    assert.equal(
      after.account.management_version,
      before.account.management_version + Number(changed),
    );
    assert.equal(after.logs, before.logs + Number(changed));
    if (changed) {
      assert.equal(after.subscription.updated_by, "master");
      assert.equal(
        after.subscription.billing_cycle,
        target === "business" ? "contract" : "monthly",
      );
      const audit = (
        await client.execute(
          "SELECT * FROM plan_change_logs WHERE resource_id='master'",
        )
      ).rows;
      assert.ok(
        audit.some(
          (log) =>
            log.actor_id === "master" &&
            log.after_json ===
              JSON.stringify({
                plan: target,
                paymentMode: "none",
                changeMode: "master_direct",
              }),
        ),
      );
    } else assert.deepEqual(after, before);
    const read = await route.GET();
    assert.equal(read.status, 200);
    assert.equal((await read.json()).plan.code, target);
    assert.deepEqual(await ancillary(), initialAncillary);
  }
  for (const source of catalog.map((p) => p.code))
    for (const target of catalog.map((p) => p.code)) {
      await changeMaster(source);
      await changeMaster(target);
      await changeMaster(target);
    }
  await changeMaster("free");
  const beforeInvalid = await state("master");
  assert.equal((await patch(input("team", "pro"))).status, 409);
  assert.equal(
    (await patch({ ...input("business", "free"), planVersion: 0 })).status,
    400,
  );
  assert.equal(
    (await patch({ ...input("business", "free"), planVersion: 99999 })).status,
    409,
  );
  for (const extra of [
    { role: "master" },
    { accountRole: "master" },
    { userId: "other" },
  ])
    assert.equal(
      (await patch({ ...input("team", "free"), ...extra })).status,
      400,
    );
  assert.deepEqual(await state("master"), beforeInvalid);
  await client.executeMultiple(`CREATE TRIGGER test_subscription_audit_failure
 BEFORE INSERT ON plan_change_logs WHEN NEW.actor_id='master'
 BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END;`);
  assert.equal((await patch(input("business", "free"))).status, 500);
  assert.deepEqual(
    await state("master"),
    beforeInvalid,
    "Audit failure must roll back subscription and version",
  );
  await client.execute("DROP TRIGGER test_subscription_audit_failure");
  await client.execute(
    "INSERT INTO plan_products(id,product_code,name,plan_code,created_by) VALUES ('legacy','legacy','Legacy product','team','master')",
  );
  await client.execute(
    "UPDATE user_subscriptions SET product_id='legacy' WHERE user_id='master'",
  );
  const supported = await state("master");
  assert.equal((await patch(input("team", "free"))).status, 409);
  assert.deepEqual(await state("master"), supported);
  await client.execute(
    "UPDATE user_subscriptions SET product_id=NULL WHERE user_id='master'",
  );
  await client.execute("DELETE FROM plan_products WHERE id='legacy'");
  const concurrent = await Promise.all([
    patch(input("team", "free")),
    patch(input("business", "free")),
  ]);
  assert.deepEqual(
    concurrent.map((r) => r.status).sort(),
    [200, 409],
    JSON.stringify(await Promise.all(concurrent.map((r) => r.clone().json()))),
  );
  const afterRace = await state("master");
  assert.equal(
    afterRace.account.management_version,
    beforeInvalid.account.management_version + 1,
  );
  assert.equal(afterRace.logs, beforeInvalid.logs + 1);
  await changeMaster("free");
  assert.equal(
    JSON.stringify(
      (await client.execute("SELECT * FROM workspaces ORDER BY id")).rows,
    ),
    workspacesBefore,
  );
  assert.equal(
    (await one("SELECT reserved FROM quota_reservations WHERE id='kept-usage'"))
      .reserved,
    100,
  );
  assert.equal(
    (await one("SELECT count(*) AS n FROM projects WHERE id='kept'")).n,
    1,
  );
  assert.deepEqual(await ancillary(), initialAncillary);
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    "PASS: auth/origin/input/stale validation, nonmaster Team/Business denial, all master plan transitions/GET, role preservation, no payment/product/request side effects, no-op/audit/version, rollback, product protection, concurrent stale rejection, preserved workspaces/usage/projects and foreign keys",
  );
} finally {
  client.close();
}
