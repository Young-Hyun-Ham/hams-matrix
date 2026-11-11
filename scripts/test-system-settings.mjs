import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { createClient } from "@libsql/client";
const require = createRequire(import.meta.url);
const loaded = new Map();
function load(path, mocks = {}) {
  if (loaded.has(path)) return loaded.get(path);
  const compiled = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(new URL(`../${path}.ts`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const localRequire = (name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/")) return load(name.slice(2), mocks);
    if (name.startsWith(".")) {
      const parts = path.split("/");
      parts.pop();
      for (const part of name.split("/")) {
        if (part === "..") parts.pop();
        else if (part !== ".") parts.push(part);
      }
      return load(parts.join("/"), mocks);
    }
    return require(name);
  };
  vm.runInThisContext(`(function(require,compiled,exports){${code}\n})`)(
    localRequire,
    compiled,
    compiled.exports,
  );
  loaded.set(path, compiled.exports);
  return compiled.exports;
}
const { defaultSettings, validateSettings, defaultErrorMessages } = load(
  "lib/system-settings/defaults",
);
const { createWorkspaceQueryPolicy } = load("lib/query/policy");
const { RequestError, resolveWorkspaceError } = load(
  "lib/query/error-messages",
);
const { QueryClient } = await import("@tanstack/react-query");
const defaults = defaultSettings("a");
const input = {
  staleTimeMs: 120000,
  retryCount: 1,
  expectedVersion: 0,
  errorMessages: { ...defaultErrorMessages, 403: "관리자 지정 문구" },
};
assert.equal(validateSettings(input).staleTimeMs, 120000);
for (const patch of [
  { staleTimeMs: -1 },
  { staleTimeMs: 1001 },
  { staleTimeMs: 86401000 },
  { staleTimeMs: NaN },
  { retryCount: 1.1 },
  { retryCount: 11 },
  { expectedVersion: null },
  { workspaceId: "b" },
  { errorMessages: {} },
  { errorMessages: { ...input.errorMessages, 403: " " } },
  { errorMessages: { ...input.errorMessages, 600: "bad" } },
])
  assert.throws(() => validateSettings({ ...input, ...patch }));
assert.equal(
  resolveWorkspaceError(new RequestError(403), input.errorMessages),
  "관리자 지정 문구",
);
assert.equal(
  resolveWorkspaceError(new RequestError(499), input.errorMessages),
  defaultErrorMessages.UNKNOWN_ERROR,
);
assert.equal(
  resolveWorkspaceError(Object.assign(new Error(), { name: "AbortError" })),
  "",
);
for (const retryCount of [0, 1, 3]) {
  const client = new QueryClient();
  let calls = 0;
  await assert.rejects(
    client.query({
      queryKey: ["test", retryCount],
      ...createWorkspaceQueryPolicy({ ...defaults, retryCount }),
      retryDelay: 0,
      queryFn: async () => {
        calls++;
        throw new RequestError(500);
      },
    }),
  );
  assert.equal(calls, retryCount + 1);
  client.clear();
}
for (const status of [400, 401, 403, 404, 409, 501])
  assert.equal(
    createWorkspaceQueryPolicy(defaults).retry(0, new RequestError(status)),
    false,
  );
assert.equal(
  createWorkspaceQueryPolicy(defaults).retryDelay(
    0,
    new RequestError(429, undefined, undefined, undefined, "http", 45000),
  ),
  45000,
);
const { acquireQueryScope } = load("lib/query/scope-lifecycle");
const lifecycle = new QueryClient();
const scopeA = { userId: "u", workspaceId: "a" };
const keyA = ["matrix", "u", "a", "projects"],
  keyB = ["matrix", "u", "b", "projects"];
lifecycle.setQueryData(keyA, { value: "a" });
lifecycle.setQueryData(keyB, { value: "b" });
const releaseFirst = acquireQueryScope(lifecycle, scopeA);
releaseFirst();
const releaseRemount = acquireQueryScope(lifecycle, scopeA);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(
  lifecycle.getQueryData(keyA).value,
  "a",
  "same-scope remount keeps observers attached to the shared cache",
);
releaseRemount();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(lifecycle.getQueryData(keyA), undefined);
assert.equal(lifecycle.getQueryData(keyB).value, "b");
lifecycle.clear();
const db = createClient({ url: "file::memory:" });
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
try {
  await db.executeMultiple(
    `PRAGMA foreign_keys=ON; CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO users VALUES ('admin'); INSERT INTO workspaces VALUES ('a'),('b'); CREATE TABLE test_audit(workspace_id TEXT,before_json TEXT,after_json TEXT);`,
  );
  await db.executeMultiple(
    readFileSync(
      new URL(
        "../db/migrations/043_workspace_system_settings.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const server = load("lib/system-settings/server", {
    "server-only": {},
    "@/lib/db": { db: () => db },
    "@/lib/auth": { HttpError },
    "@/lib/master-workspace-admin": {
      masterWorkspaceScope: async (user) => {
        if (user.id !== "admin") throw new HttpError(403, "denied");
        return { id: user.workspaceId };
      },
    },
    "@/lib/product-access": {
      productAdminScope: async () => {
        throw new HttpError(403, "denied");
      },
      productWorkspace: async () => undefined,
    },
    "@/lib/audit": {
      audit: async (_request, input, tx) => {
        await tx.execute({
          sql: "INSERT INTO test_audit VALUES (?,?,?)",
          args: [
            input.user.workspaceId,
            JSON.stringify(input.before),
            JSON.stringify(input.after),
          ],
        });
      },
    },
  });
  const user = { id: "admin", workspaceId: "a", accountRole: "master" };
  assert.equal((await server.getWorkspaceSystemSettings(user)).version, 0);
  assert.equal(
    (await db.execute("SELECT count(*) AS n FROM workspace_system_settings"))
      .rows[0].n,
    0,
  );
  const request = new Request("http://test/api/admin/settings/system", {
    method: "PATCH",
  });
  assert.equal(
    (await server.saveWorkspaceSystemSettings(request, user, input)).version,
    1,
  );
  await assert.rejects(
    server.saveWorkspaceSystemSettings(request, user, input),
    (e) => e.status === 409,
  );
  assert.equal(
    (await server.getWorkspaceSystemSettings({ workspaceId: "b" })).source,
    "default",
  );
  const updated = await server.saveWorkspaceSystemSettings(request, user, {
    ...input,
    expectedVersion: 1,
    retryCount: 0,
  });
  assert.equal(updated.version, 2);
  assert.equal(updated.retryCount, 0);
  assert.equal(
    (await db.execute("SELECT count(*) AS n FROM test_audit")).rows[0].n,
    2,
  );
  await assert.rejects(
    server.saveWorkspaceSystemSettings(
      request,
      { ...user, id: "outsider" },
      { ...input, expectedVersion: 2 },
    ),
    (e) => e.status === 403,
  );
  for (const sql of [
    "UPDATE workspace_system_settings SET stale_time_ms=1",
    "UPDATE workspace_system_settings SET retry_count=11",
    "UPDATE workspace_system_settings SET error_messages_json='[]'",
    "UPDATE workspace_system_settings SET version=0",
  ])
    await assert.rejects(db.execute(sql));
  await db.executeMultiple("DELETE FROM workspaces WHERE id='a'");
  assert.equal(
    (await db.execute("SELECT count(*) AS n FROM workspace_system_settings"))
      .rows[0].n,
    0,
  );
  console.log(
    "System settings validation, retry counts, errors, isolated DB constraints, scope, versions and transactional audit: passed",
  );
} finally {
  db.close();
}
