// Isolated SQLite, real auth/policies/handlers, and a private in-process payment adapter.
// Does not read .env, contact the live database, send notifications externally or charge money.
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
const folder = await mkdtemp(join(tmpdir(), "matrix-products-"));
const client = createClient({
  url: pathToFileURL(join(folder, "test.db")).href,
  timeout: 5000,
});
const require = createRequire(import.meta.url),
  cache = new Map();
process.env.APP_URL = "http://test.local";
let token = "master-session";
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
      if (!target) throw new Error(base);
      return load(target);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const one = async (sql, args = []) =>
  (await client.execute({ sql, args })).rows[0];
function req(
  path,
  method = "GET",
  input,
  origin = "http://test.local",
  extra = {},
) {
  return new Request(`http://test.local${path}`, {
    method,
    headers: { origin, "Content-Type": "application/json", ...extra },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}
async function json(response, status = 200) {
  const r = await response;
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  return d;
}
async function session(userId, workspaceId) {
  const value = `${userId}-session`;
  await client.execute({
    sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
    args: [
      value,
      createHash("sha256").update(value).digest("hex"),
      userId,
      workspaceId,
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
    ],
  });
  return value;
}
async function newUser(auth, id, role = "user") {
  for (const s of auth.newUserStatements(
    id,
    `${id}-ws`,
    id,
    `${id}@example.test`,
    null,
    { role: "user", plan: "free", teamId: null },
  ))
    await client.execute(s);
  if (role !== "user")
    await client.execute({
      sql: "UPDATE users SET account_role=? WHERE id=?",
      args: [role, id],
    });
  await session(id, `${id}-ws`);
}
try {
  for (const f of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await client.executeMultiple(
      await readFile(join("db/migrations", f), "utf8"),
    );
  const auth = load(resolve("lib/auth.ts")),
    plans = load(resolve("lib/plans.ts"));
  const api = load(resolve("app/api/super-admin/plans/route.ts")),
    members = load(resolve("app/api/team/members/route.ts")),
    projects = load(resolve("app/api/projects/route.ts"));
  assert.deepEqual(
    (await plans.listPlans()).map((p) => [p.code, p.projectInviteLimit]),
    [
      ["free", 1],
      ["pro", 1],
      ["team", 20],
      ["business", null],
    ],
  );
  await newUser(auth, "master", "master");
  await newUser(auth, "owner");
  for (let i = 0; i < 25; i++) await newUser(auth, "u" + i);
  token = "master-session";
  let pro = (await plans.listPlans()).find((p) => p.code === "pro");
  const patch = (p) => api.PATCH(req("/api/super-admin/plans", "PATCH", p));
  await json(patch({ ...pro, projectInviteLimit: -1 }), 400);
  await json(patch({ ...pro, projectInviteLimit: 1.5 }), 400);
  await json(patch({ ...pro, projectInviteLimit: "2" }), 400);
  await json(patch({ ...pro, projectInviteLimit: 2 }), 200);
  await json(patch({ ...pro, projectInviteLimit: 3 }), 409);
  pro = (await plans.listPlans()).find((p) => p.code === "pro");
  await json(patch({ ...pro, projectInviteLimit: null }), 200);
  pro = (await plans.listPlans()).find((p) => p.code === "pro");
  await json(
    patch({
      ...pro,
      projectInviteLimit: 1,
      teamSharingEnabled: true,
      projectLimit: null,
    }),
    200,
  );
  token = "owner-session";
  await json(patch({ ...pro, projectInviteLimit: 5 }), 403);
  await client.execute(
    "UPDATE user_subscriptions SET plan_code='pro' WHERE user_id='owner'",
  );
  await client.execute(
    "INSERT INTO workspaces(id,name,owner_id) VALUES ('pws','Pro','owner')",
  );
  await client.execute(
    "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('pws','owner','owner')",
  );
  await client.execute(
    "UPDATE sessions SET workspace_id='pws' WHERE user_id='owner'",
  );
  await client.execute(
    "UPDATE users SET active_workspace_id='pws' WHERE id='owner'",
  );
  for (const p of ["p1", "p2"]) {
    await client.execute({
      sql: "INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES (?,'pws',?,'owner','owner')",
      args: [p, p],
    });
    await client.execute({
      sql: "INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES (?,'pws','owner','admin')",
      args: [p],
    });
  }
  const invite = (p, id) =>
    members.POST(
      req("/api/team/members", "POST", {
        projectId: p,
        email: id + "@example.test",
      }),
    );
  await json(invite("p1", "u0"), 201);
  const full = await json(invite("p1", "u1"), 403);
  assert.equal(full.code ?? full.details?.code, "PROJECT_INVITE_LIMIT");
  assert.equal(
    (
      await one(
        "SELECT count(*) AS n FROM workspace_members WHERE workspace_id='pws' AND user_id='u1'",
      )
    ).n,
    0,
  );
  await json(invite("p2", "u1"), 201);
  await json(invite("p1", "u0"), 409);
  await json(
    projects.POST(
      req("/api/projects", "POST", {
        name: "Too many",
        description: "",
        memberIds: ["u0", "u1"],
      }),
    ),
    403,
  );
  await json(
    projects.POST(
      req("/api/projects", "POST", {
        name: "At limit",
        description: "",
        memberIds: ["u0", "u0", "owner"],
      }),
    ),
    201,
  );
  await client.execute(
    "UPDATE plans SET project_invite_limit=0 WHERE code='pro'",
  );
  assert.equal(
    (
      await one(
        "SELECT count(*) AS n FROM project_members WHERE project_id='p1'",
      )
    ).n,
    2,
  );
  await json(invite("p1", "u2"), 403);
  await client.execute(
    "UPDATE plans SET project_invite_limit=2 WHERE code='pro'",
  );
  const concurrent = await Promise.all(
    ["u2", "u3"].map((id) => invite("p1", id)),
  );
  const statuses = concurrent.map((r) => r.status);
  assert.equal(statuses.filter((s) => s === 201).length, 1);
  assert.ok(statuses.some((s) => s === 403 || s === 409));
  const failed = statuses[0] !== 201 ? "u2" : "u3";
  await json(invite("p1", failed), 403);
  assert.equal(
    (
      await one(
        "SELECT count(*) AS n FROM project_members WHERE project_id='p1' AND user_id!='owner'",
      )
    ).n,
    2,
  );
  await client.execute(
    "UPDATE plans SET project_invite_limit=NULL WHERE code='pro'",
  );
  await json(invite("p1", "u4"), 201);
  await assert.doesNotReject(
    plans.assertProjectInviteCapacity("owner", 10000, client, "pws"),
  );
  await client.execute(
    "UPDATE user_subscriptions SET plan_code='free' WHERE user_id='owner'",
  );
  await assert.rejects(
    plans.assertProjectInviteCapacity("owner", 0, client, "pws"),
    (e) => e.status === 409,
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    "PASS: invite defaults, master-only save, null/zero/integer validation, stale version, owner exclusion, per-project limits, create-with-members bypass prevention, rollback, concurrent invites, retained existing members, unlimited and fixed workspace policy",
  );
} finally {
  client.close();
}
