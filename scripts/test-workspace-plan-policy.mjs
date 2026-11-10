// Real auth, policies, role checks and recovery routes against isolated SQLite.
// Never reads .env, contacts the live database, or invokes an AI provider.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import ts from "typescript";

const folder = await mkdtemp(join(tmpdir(), "matrix-workspace-policy-"));
const client = createClient({
  url: pathToFileURL(join(folder, "test.db")).href,
});
const require = createRequire(import.meta.url),
  cache = new Map();
process.env.APP_URL = "http://test.local";
let token = "owner-token";
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => client };
  if (cache.has(file)) return cache.get(file).exports;
  if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (name === "server-only") return {};
      if (name === "next/headers")
        return {
          cookies: async () => ({
            get: () => (token ? { value: token } : undefined),
          }),
        };
      if (name === "next/server") return { connection: async () => {} };
      if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
      const base = name.startsWith("@/")
        ? resolve(name.slice(2))
        : resolve(dirname(file), name);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw new Error(`Missing module: ${base}`);
      return load(target);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const one = async (sql, args = []) =>
  (await client.execute({ sql, args })).rows[0];
const request = (path, method = "GET", data, origin = "http://test.local") =>
  new Request(`http://test.local${path}`, {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
const mismatch = (error) =>
  error.status === 409 && error.details?.code === "WORKSPACE_PLAN_MISMATCH";
const snapshot = async () =>
  JSON.stringify(
    (await client.execute("SELECT * FROM workspaces ORDER BY id")).rows,
  );
try {
  await client.execute("PRAGMA foreign_keys=ON");
  const migration = "040_workspace_plan_policy.sql";
  for (const name of (await readdir("db/migrations"))
    .filter((name) => name.endsWith(".sql") && name < migration)
    .sort())
    await client.executeMultiple(
      await readFile(join("db/migrations", name), "utf8"),
    );
  await client.executeMultiple(`
    INSERT INTO users(id,name,account_role) VALUES ('owner','Owner','user'),('viewer','Viewer','user'),('outsider','Outsider','user');
    UPDATE user_subscriptions SET plan_code='team' WHERE user_id IN ('owner','viewer');
    INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Legacy workspace','owner');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','viewer','viewer');
    UPDATE users SET active_workspace_id='ws' WHERE id IN ('owner','viewer');
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','ws','Preserved project','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('p','ws','owner','admin'),('p','ws','viewer','viewer');
  `);
  const sql = await readFile(join("db/migrations", migration), "utf8");
  const before = await snapshot();
  const rollback = await client.transaction("write");
  try {
    await rollback.executeMultiple(sql);
    await rollback.rollback();
  } finally {
    rollback.close();
  }
  assert.equal(
    await snapshot(),
    before,
    "Migration must roll back without losing old values",
  );
  await client.executeMultiple(sql);
  assert.deepEqual(
    {
      ...(await one(
        "SELECT plan,subscription_plan FROM workspaces WHERE id='ws'",
      )),
    },
    { plan: "team", subscription_plan: "team" },
  );
  assert.equal(
    (await one("SELECT legacy_workspace_plan FROM workspaces WHERE id='ws'"))
      .legacy_workspace_plan,
    "free",
  );
  assert.equal((await one("SELECT count(*) AS n FROM projects")).n, 1);
  assert.equal((await one("SELECT count(*) AS n FROM workspace_members")).n, 2);
  await assert.rejects(
    client.execute("UPDATE workspaces SET plan='pro' WHERE id='ws'"),
  );
  for (const [userId, value] of [
    ["owner", "owner-token"],
    ["viewer", "viewer-token"],
  ]) {
    await client.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,'ws',?,?)",
      args: [
        value,
        createHash("sha256").update(value).digest("hex"),
        userId,
        new Date().toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
      ],
    });
  }
  await client.executeMultiple(
    await readFile("db/migrations/041_product_administration.sql", "utf8"),
  );
  const auth = load(resolve("lib/auth.ts"));
  const plans = load(resolve("lib/plans.ts"));
  const quotas = load(resolve("lib/quotas.ts"));
  const permissions = load(resolve("lib/project-permissions.ts"));
  const subscription = load(resolve("app/api/me/subscription/route.ts"));
  const workspace = load(resolve("app/api/me/workspace/route.ts"));
  const me = load(resolve("app/api/me/route.ts"));
  assert.equal((await auth.requireUser()).workspacePlan, "team");
  assert.equal((await plans.workspacePlan("owner", "ws")).code, "team");
  await assert.rejects(
    plans.workspacePlan("outsider", "ws"),
    (error) => error.status === 403,
  );
  const projectCount = await one("SELECT count(*) AS n FROM projects");
  token = "viewer-token";
  const viewer = await auth.requireUser();
  await assert.rejects(
    permissions.requireProjectPermission(
      client,
      viewer,
      "p",
      "requirement",
      "CREATE",
    ),
    (error) => error.status === 403,
  );
  token = "owner-token";
  const owner = await auth.requireUser();
  await permissions.requireProjectPermission(
    client,
    owner,
    "p",
    "requirement",
    "CREATE",
  );
  assert.equal(await plans.projectHistoryEnabled("p"), true);
  await client.execute("UPDATE plans SET project_limit=1 WHERE code='team'");
  await assert.rejects(
    plans.assertProjectCapacity("owner", client, "ws"),
    (error) => error.status === 403,
  );
  await quotas.reserveQuota("owner", "before-change", "tokens", 10, "ws");
  const free = (await plans.listPlans()).find((plan) => plan.code === "free");
  assert.equal(
    (
      await subscription.PATCH(
        request("/api/me/subscription", "PATCH", {
          plan: "free",
          currentPlan: "team",
          planVersion: free.version,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await one("SELECT plan FROM workspaces WHERE id='ws'")).plan,
    "team",
    "Subscription change must not modify a workspace",
  );
  assert.equal(
    await plans.projectHistoryEnabled("p"),
    true,
    "Project history must follow the workspace rather than its owner's new subscription",
  );
  await assert.rejects(auth.requireUser(), mismatch);
  await assert.rejects(plans.workspacePlan("owner", "ws"), mismatch);
  await assert.rejects(
    quotas.reserveQuota("owner", "blocked", "tokens", 1, "ws"),
    mismatch,
  );
  await assert.rejects(
    permissions.requireProjectPermission(
      client,
      owner,
      "p",
      "requirement",
      "CREATE",
    ),
    mismatch,
  );
  const rejected = auth.errorResponse(
    await auth.requireUser().catch((error) => error),
  );
  assert.equal(rejected.headers.get("X-Workspace-Plan-Mismatch"), "1");
  const detail = await rejected.json();
  assert.equal(detail.workspacePlan, "team");
  assert.equal(detail.currentPlan, "free");
  assert.equal(
    detail.redirectTo,
    "/settings/subscription?reason=workspace-plan",
  );
  assert.equal(
    (await me.GET(request("/api/me"))).status,
    200,
    "Mismatch detection must remain accessible",
  );
  assert.equal(
    (await subscription.GET()).status,
    200,
    "Subscription recovery must remain accessible",
  );
  assert.equal(
    (await workspace.GET()).status,
    200,
    "Workspace recovery must remain accessible",
  );
  assert.equal(
    (
      await workspace.POST(
        request("/api/me/workspace", "POST", {
          name: "Rejected",
          plan: "business",
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await workspace.POST(
        request(
          "/api/me/workspace",
          "POST",
          { name: "Rejected" },
          "http://foreign.local",
        ),
      )
    ).status,
    403,
  );
  const created = await workspace.POST(
    request("/api/me/workspace", "POST", { name: "Free workspace" }),
  );
  assert.equal(created.status, 201);
  const newSpace = (await created.json()).workspace;
  assert.equal(newSpace.plan, "free");
  assert.equal((await auth.requireUser()).workspaceId, newSpace.id);
  await plans.assertProjectCapacity("owner", client, newSpace.id);
  assert.equal(
    (
      await workspace.PATCH(
        request("/api/me/workspace", "PATCH", { workspaceId: "ws" }),
      )
    ).status,
    200,
  );
  await assert.rejects(auth.requireUser(), mismatch);
  const team = (await plans.listPlans()).find((plan) => plan.code === "team");
  assert.equal(
    (
      await subscription.PATCH(
        request("/api/me/subscription", "PATCH", {
          plan: "team",
          currentPlan: "free",
          planVersion: team.version,
        }),
      )
    ).status,
    409,
  );
  // Verified payment is covered by test-product-administration; seed a legacy recovery here.
  await client.execute(
    "UPDATE user_subscriptions SET plan_code='team' WHERE user_id='owner'",
  );
  await auth.requireUser();
  await quotas.reserveQuota("owner", "after-recovery", "tokens", 1, "ws");
  assert.equal(
    (
      await one(
        "SELECT reserved FROM quota_reservations WHERE id='before-change'",
      )
    ).reserved,
    10,
    "Changing plans must not reset usage",
  );
  for (const code of ["free", "pro", "team", "business"]) {
    await client.execute({
      sql: "UPDATE user_subscriptions SET plan_code=? WHERE user_id='owner'",
      args: [code],
    });
    const response = await workspace.POST(
      request("/api/me/workspace", "POST", { name: `${code} workspace` }),
    );
    assert.equal(response.status, 201);
    const createdSpace = (await response.json()).workspace;
    assert.equal(
      (await plans.workspacePlan("owner", createdSpace.id)).code,
      code,
    );
  }
  assert.equal(
    (await one("SELECT plan FROM workspaces WHERE id='ws'")).plan,
    "team",
  );
  await assert.rejects(
    plans.workspacePlan("owner", "ws"),
    mismatch,
    "A higher Business subscription must not bypass a Team workspace's exact plan requirement",
  );
  assert.deepEqual(
    { ...(await one("SELECT count(*) AS n FROM projects")) },
    { ...projectCount },
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  token = "";
  assert.equal(
    (
      await workspace.POST(
        request("/api/me/workspace", "POST", { name: "Anonymous" }),
      )
    ).status,
    401,
  );
  console.log(
    "PASS: transactional backfill, preserved data/FKs, four plan codes, creation snapshots, frozen existing plans, workspace history/capacity, role enforcement, exact mismatch checks, quota blocking without resets, modal error metadata, recovery routes, origin/input validation and session switching",
  );
} finally {
  client.close();
}
