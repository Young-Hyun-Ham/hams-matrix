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
  await client.execute("PRAGMA foreign_keys=ON");
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await client.executeMultiple(
      await readFile(join("db/migrations", name), "utf8"),
    );
  await client.execute(
    "UPDATE admin_setting SET value_json='true' WHERE setting_key='DB_LOGGING_ENABLED'",
  );
  const auth = load(resolve("lib/auth.ts"));
  await newUser(auth, "master", "master");
  await newUser(auth, "member");
  const settings = load(resolve("app/api/me/system-settings/route.ts"));
  const admin = load(resolve("app/api/admin/settings/system/route.ts"));
  const { defaultErrorMessages } = load(
    resolve("lib/system-settings/defaults.ts"),
  );
  token = "master-session";
  let current = await json(settings.GET());
  assert.equal(current.source, "default");
  assert.equal(current.version, 0);
  assert.equal(
    Number((await one("SELECT count(*) n FROM workspace_system_settings")).n),
    0,
  );
  const input = {
    staleTimeMs: 120000,
    retryCount: 1,
    errorMessages: { ...defaultErrorMessages, 403: "테스트 권한 안내" },
    expectedVersion: 0,
  };
  current = await json(
    admin.PATCH(req("/api/admin/settings/system", "PATCH", input)),
  );
  assert.equal(current.version, 1);
  assert.equal(current.errorMessages[403], input.errorMessages[403]);
  await json(
    admin.PATCH(req("/api/admin/settings/system", "PATCH", input)),
    409,
  );
  await json(
    admin.PATCH(
      req("/api/admin/settings/system", "PATCH", {
        ...input,
        expectedVersion: 1,
        workspaceId: "member-ws",
      }),
    ),
    400,
  );
  await json(
    admin.PATCH(
      req(
        "/api/admin/settings/system",
        "PATCH",
        { ...input, expectedVersion: 1 },
        "http://evil.test",
      ),
    ),
    403,
  );
  const duplicate = JSON.stringify({ ...input, expectedVersion: 1 }).replace(
    '"403":',
    '"403":"duplicate","403":',
  );
  await json(
    admin.PATCH(
      new Request("http://test.local/api/admin/settings/system", {
        method: "PATCH",
        headers: {
          origin: "http://test.local",
          "Content-Type": "application/json",
        },
        body: duplicate,
      }),
    ),
    400,
  );
  for (const patch of [
    { staleTimeMs: 1 },
    { retryCount: -1 },
    { retryCount: 11 },
    { errorMessages: [] },
  ])
    await json(
      admin.PATCH(
        req("/api/admin/settings/system", "PATCH", {
          ...input,
          ...patch,
          expectedVersion: 1,
        }),
      ),
      400,
    );
  const messages = { ...defaultErrorMessages };
  for (let code = 400; Object.keys(messages).length < 64; code++)
    messages[code] = "가".repeat(500);
  const large = { ...input, expectedVersion: 1, errorMessages: messages };
  assert.ok(Buffer.byteLength(JSON.stringify(large)) > 10000);
  current = await json(
    admin.PATCH(req("/api/admin/settings/system", "PATCH", large)),
  );
  assert.equal(current.version, 2);
  await json(
    admin.PATCH(
      req("/api/admin/settings/system", "PATCH", {
        ...large,
        oversized: "가".repeat(50000),
      }),
    ),
    413,
  );
  const history = await one(
    "SELECT after_json FROM audit_logs WHERE resource_type='workspace_system_settings' ORDER BY occurred_at DESC LIMIT 1",
  );
  assert.equal(JSON.parse(String(history.after_json)).staleTimeMs, 120000);
  token = "member-session";
  assert.equal((await json(settings.GET())).workspaceId, "member-ws");
  assert.equal((await json(settings.GET())).source, "default");
  await json(admin.GET(), 403);
  await json(
    admin.PATCH(req("/api/admin/settings/system", "PATCH", input)),
    403,
  );
  await client.execute(
    "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('member-ws','master','viewer')",
  );
  await client.execute(
    "UPDATE sessions SET workspace_id='member-ws' WHERE user_id='master'",
  );
  token = "master-session";
  await json(
    admin.PATCH(req("/api/admin/settings/system", "PATCH", input)),
    403,
  );
  token = "";
  await json(settings.GET(), 401);
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    "PASS: real-auth settings GET/PATCH, member read/admin denial, workspace boundary, Origin, full input validation, UTF-8 body limits, versions and audit snapshots",
  );
} finally {
  client.close();
}
