import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const fixture = await dashboardFixture(),
  { db } = fixture,
  require = createRequire(import.meta.url),
  cache = new Map();
let token = "dash-owner-session";
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => db };
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
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
      const target = [base, base + ".ts", base + ".tsx"].find(
        (p) => existsSync(p) && !p.endsWith("/"),
      );
      assert.ok(target, base);
      return load(target);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const root = "/api/builder",
  ctx = (scenarioId) => ({ params: Promise.resolve({ scenarioId }) });
const route = (path, method) =>
  load(resolve("app/api/builder/" + path + "/route.ts"))[method];
function req(path, method = "GET", data, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000" + root + path, {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(data ?? {}) }),
  });
}
async function result(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}
let checks = 0;
try {
  await db.execute(
    "UPDATE users SET account_role='team_admin' WHERE id IN ('dash-owner','dash-outsider')",
  );
  // Use repository with the real DB and audit service; routes use synthetic verified identities.
  const auth = load(resolve("lib/auth.ts")),
    owner = await auth.userInWorkspace("dash-owner", "dash-ws");
  const access = load(resolve("app/(builder)/server/access.ts"));
  access.builderUser = async () => {
    if (!token) throw new auth.HttpError(401, "Login required");
    const id = token.replace("-session", "");
    const user = await auth.userInWorkspace(id, "dash-ws");
    access.assertBuilderAccess(user);
    return user;
  };
  const scenarios = route("scenarios", "POST");
  token = "";
  await result(
    await scenarios(req("/scenarios", "POST", { name: "blocked" })),
    401,
  );
  checks++;
  token = "dash-viewer-session";
  await result(
    await scenarios(req("/scenarios", "POST", { name: "blocked" })),
    403,
  );
  checks++;
  token = "dash-owner-session";
  await result(
    await scenarios(
      req("/scenarios", "POST", { name: "blocked" }, "https://example.invalid"),
    ),
    403,
  );
  checks++;
  const created = await result(
    await scenarios(
      req("/scenarios", "POST", {
        name: "한글 & 공백 % _",
        scenario_type: "agent",
        nodes: [
          {
            id: "message",
            type: "message",
            position: { x: 1, y: 2 },
            data: { content: "hello" },
          },
        ],
        edges: [],
        startNodeId: "message",
      }),
    ),
    201,
  );
  let s = created.scenario;
  assert.equal(s.revision, 1);
  checks++;
  const list = await result(
    await route(
      "scenarios",
      "GET",
    )(req("/scenarios?name=" + encodeURIComponent("& 공백"))),
  );
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].nodes, undefined);
  checks++;
  await result(
    await route("scenarios/[scenarioId]", "PATCH")(
      req("/scenarios/" + s.id, "PATCH", {
        name: "updated",
        expectedRevision: 99,
      }),
      ctx(s.id),
    ),
    409,
  );
  checks++;
  s = (
    await result(
      await route("scenarios/[scenarioId]", "PATCH")(
        req("/scenarios/" + s.id, "PATCH", {
          name: "renamed",
          expectedRevision: s.revision,
        }),
        ctx(s.id),
      ),
    )
  ).scenario;
  assert.equal(s.revision, 2);
  checks++;
  const pub = { expectedRevision: s.revision, requestId: "publish-1" };
  const publish = route("scenarios/[scenarioId]/versions", "POST");
  s = (
    await result(
      await publish(
        req("/scenarios/" + s.id + "/versions", "POST", pub),
        ctx(s.id),
      ),
    )
  ).scenario;
  assert.equal(s.latest_version, 1);
  await result(
    await publish(
      req("/scenarios/" + s.id + "/versions", "POST", pub),
      ctx(s.id),
    ),
  );
  assert.equal(
    Number(
      (
        await db.execute({
          sql: "SELECT count(*) n FROM builder_scenario_versions WHERE scenario_id=?",
          args: [s.id],
        })
      ).rows[0].n,
    ),
    1,
  );
  checks++;
  await result(
    await publish(
      req("/scenarios/" + s.id + "/versions", "POST", {
        ...pub,
        name: "different",
      }),
      ctx(s.id),
    ),
    409,
  );
  checks++;
  const version = await result(
    await route("scenarios/[scenarioId]/versions/[versionNumber]", "GET")(
      req("/scenarios/" + s.id + "/versions/1"),
      { params: Promise.resolve({ scenarioId: s.id, versionNumber: "1" }) },
    ),
  );
  assert.equal(version.scenario.name, "renamed");
  checks++;
  await assert.rejects(
    db.execute("UPDATE builder_scenario_versions SET snapshot_json='{}'"),
  );
  await assert.rejects(db.execute("DELETE FROM builder_scenario_versions"));
  checks++;
  s = (
    await result(
      await route("scenarios/[scenarioId]/deployments", "POST")(
        req("/scenarios/" + s.id + "/deployments", "POST", {
          versionNumber: 1,
          requestId: "deploy-1",
          expectedRevision: s.revision,
        }),
        ctx(s.id),
      ),
    )
  ).scenario;
  assert.equal(s.deployed_version, 1);
  checks++;
  s = (
    await result(
      await route("scenarios/[scenarioId]/restore", "POST")(
        req("/scenarios/" + s.id + "/restore", "POST", {
          versionNumber: 1,
          expectedRevision: s.revision,
        }),
        ctx(s.id),
      ),
    )
  ).scenario;
  assert.equal(s.latest_version, 1);
  assert.equal(s.deployed_version, 1);
  checks++;
  const repo = load(resolve("app/(builder)/server/repository.ts"));

  const beforeFailure = await repo.getScenario(owner, s.id, db);
  const failingClient = {
    transaction: async (mode) => {
      const tx = await db.transaction(mode),
        execute = tx.execute.bind(tx);
      tx.execute = async (statement) => {
        if (statement.sql?.startsWith("INSERT INTO builder_scenario_versions"))
          throw new Error("synthetic insert failure");
        return execute(statement);
      };
      return tx;
    },
  };
  await assert.rejects(
    repo.publish(
      req("/scenarios", "POST"),
      owner,
      s.id,
      { expectedRevision: s.revision, requestId: "fail-publish" },
      failingClient,
    ),
  );
  assert.equal(
    (await repo.getScenario(owner, s.id, db)).revision,
    beforeFailure.revision,
  );
  checks++;
  const memo = {
    id: "memo-1",
    text: "persistent memo",
    x: 10,
    y: 20,
    width: 200,
    height: 100,
  };
  const memoScenario = await repo.createScenario(
    req("/scenarios", "POST"),
    owner,
    {
      name: "memo scenario",
      notes: [{ id: "note-1", text: "note" }],
      canvasMemos: [memo],
    },
    db,
  );
  assert.equal(memoScenario.canvasMemos[0].text, "persistent memo");
  checks++;
  const attempts = await Promise.allSettled([
    repo.publish(
      req("/scenarios", "POST"),
      owner,
      memoScenario.id,
      { expectedRevision: 1, requestId: "concurrent-1" },
      db,
    ),
    repo.publish(
      req("/scenarios", "POST"),
      owner,
      memoScenario.id,
      { expectedRevision: 1, requestId: "concurrent-2" },
      db,
    ),
  ]);
  assert.equal(
    attempts.filter((x) => x.status === "fulfilled").length,
    1,
    JSON.stringify(
      attempts.map((x) =>
        x.status === "fulfilled"
          ? { status: x.status }
          : { status: x.status, reason: x.reason.message, code: x.reason.code },
      ),
    ),
  );
  assert.equal(
    attempts.filter((x) => x.status === "rejected" && x.reason.status === 409)
      .length,
    1,
  );
  checks++;
  const foreign = await auth.userInWorkspace("dash-outsider", "dash-foreign");
  await assert.rejects(
    repo.getScenario(foreign, s.id, db),
    (e) => e.status === 404,
  );
  checks++;
  const clone = (
    await result(
      await route("scenarios/[scenarioId]/clone", "POST")(
        req("/scenarios/" + s.id + "/clone", "POST", { newName: "copy" }),
        ctx(s.id),
      ),
    )
  ).scenario;
  assert.notEqual(clone.id, s.id);
  assert.equal(clone.latest_version, 0);
  checks++;
  await assert.rejects(
    repo.deleteScenarios(
      req("/scenarios/delete", "POST"),
      owner,
      {
        scenarioIds: [clone.id, s.id],
        expectedRevisions: { [clone.id]: 1, [s.id]: 999 },
      },
      db,
    ),
    (e) => e.status === 409,
  );
  assert.equal((await repo.getScenario(owner, clone.id, db)).revision, 1);
  checks++;
  const form = (
    await result(
      await route(
        "forms",
        "POST",
      )(
        req("/forms", "POST", {
          title: "form",
          elements: [{ id: "field", type: "input", defaultValue: "value" }],
          definition: {
            data: { dataSource: "source", dataSourceType: "json" },
          },
        }),
      ),
      201,
    )
  ).form;
  assert.equal(form.revision, 1);
  assert.equal(form.definition.data.dataSource, "source");
  const updated = await repo.saveResource(
    req("/forms", "PATCH"),
    owner,
    "forms",
    form.id,
    { title: "new form", elements: form.elements, expectedRevision: 1 },
    db,
  );
  assert.equal(updated.revision, 2);
  await assert.rejects(
    repo.saveResource(
      req("/forms", "PATCH"),
      owner,
      "forms",
      form.id,
      { title: "stale", expectedRevision: 1 },
      db,
    ),
    (e) => e.status === 409,
  );
  checks++;
  const template = await repo.saveResource(
    req("/templates", "POST"),
    owner,
    "templates",
    null,
    {
      name: "API",
      kind: "api",
      content: { url: "https://example.invalid/mock", method: "GET" },
    },
    db,
  );
  assert.equal(template.kind, "api");
  await repo.deleteResource(
    req("/templates", "DELETE"),
    owner,
    "templates",
    String(template.id),
    { expectedRevision: 1 },
    db,
  );
  await assert.rejects(
    repo.getResource(owner, "templates", String(template.id), db),
    (e) => e.status === 404,
  );
  checks++;
  assert.equal((await repo.settings(owner, db)).revision, 0);
  assert.equal(
    Number(
      (await db.execute("SELECT count(*) n FROM builder_user_settings")).rows[0]
        .n,
    ),
    0,
  );
  await repo.saveSettings(
    req("/settings", "PUT"),
    owner,
    { expectedRevision: 0, settings: { unuseNodes: ["toast"] } },
    false,
    db,
  );
  await assert.rejects(
    repo.saveSettings(
      req("/settings", "PUT"),
      owner,
      { expectedRevision: 0, settings: {} },
      false,
      db,
    ),
    (e) => e.status === 409,
  );
  checks++;
  await db.execute(
    "UPDATE workspace_members SET role='viewer' WHERE workspace_id='dash-ws' AND user_id='dash-owner'",
  );
  await assert.rejects(
    repo.updateScenario(
      req("/scenarios", "PATCH"),
      owner,
      s.id,
      { expectedRevision: s.revision, name: "forbidden" },
      db,
    ),
    (e) => e.status === 403,
  );
  await db.execute(
    "UPDATE workspace_members SET role='owner' WHERE workspace_id='dash-ws' AND user_id='dash-owner'",
  );
  checks++;
  await repo.deleteScenarios(
    req("/scenarios/delete", "POST"),
    owner,
    { scenarioIds: [s.id], expectedRevisions: { [s.id]: s.revision } },
    db,
  );
  await assert.rejects(
    repo.getScenario(owner, s.id, db),
    (e) => e.status === 404,
  );
  assert.equal(
    Number(
      (
        await db.execute({
          sql: "SELECT count(*) n FROM builder_scenario_versions WHERE scenario_id=?",
          args: [s.id],
        })
      ).rows[0].n,
    ),
    1,
  );
  checks++;

  const {runApiNode}=load(resolve('app/(builder)/components/emulator/runners/runApiNode.ts'));
  const oldFetch=globalThis.fetch,oldError=console.error;let slots={},methodBody;
  try {
    console.error=()=>{};
    globalThis.fetch=async (_url,options)=>{methodBody=options.body;return new Response(JSON.stringify({data:{items:[{value:42}]}}),{status:200});};
    const apiNode={id:'api',type:'api',data:{url:'https://example.invalid/mock',method:'GET',responseMapping:[{slot:'answer',path:'data.items[0].value'}]}};
    const deps={slotValues:{},formValues:{},setSlotValues:value=>{slots=typeof value==='function'?value(slots):value;}};
    assert.equal(await runApiNode(apiNode,deps),true);assert.equal(slots.answer,42);checks++;
    globalThis.fetch=async()=>new Response(null,{status:503});assert.equal(await runApiNode(apiNode,deps),false);checks++;
    globalThis.fetch=async (_url,options)=>{methodBody=options.body;return new Response(null,{status:204});};
    assert.equal(await runApiNode({...apiNode,data:{...apiNode.data,method:'HEAD',body:'{}',responseMapping:[]}},deps),true);assert.equal(methodBody,undefined);checks++;
    const cancelled=new AbortController();cancelled.abort();slots={};assert.equal(await runApiNode(apiNode,{...deps,signal:cancelled.signal}),false);assert.deepEqual(slots,{});checks++;
  } finally {globalThis.fetch=oldFetch;console.error=oldError;}
  assert.equal((await db.execute("PRAGMA foreign_key_check")).rows.length, 0);
  assert.equal(
    (await db.execute("PRAGMA integrity_check")).rows[0].integrity_check,
    "ok",
  );
  checks++;
  console.log(
    `Builder Turso API/repository: ${checks} checks passed (isolated DB, synthetic identities).`,
  );
} finally {
  db.close();
}
