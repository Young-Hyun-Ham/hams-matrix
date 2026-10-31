// Real route handlers, authorization, SQLite migrations and encryption. Only Next's request
// cookie context and the external OpenAI provider are replaced; no paid requests are made.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import ts from "typescript";


const folder = await mkdtemp(join(tmpdir(), "matrix-wbs-schedule-"));
process.env.TURSO_DATABASE_URL = pathToFileURL(join(folder, "test.db")).href;
process.env.TURSO_AUTH_TOKEN = "";
process.env.OPENAI_API_KEY = "test-key";
process.env.AI_IMAGE_ENCRYPTION_KEY = Buffer.alloc(32, 71).toString("base64");
process.env.APP_URL = "http://localhost:3000";
delete process.env.OPENAI_IMAGE_MODELS;
delete process.env.OPENAI_IMAGE_MODEL;
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
const require = createRequire(import.meta.url), cache = new Map();
let token = "owner-token";
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)((request) => {
    if (request === "server-only") return {};
    if (request === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
    if (request === "next/server") return { connection: async () => {} };
    if (!request.startsWith(".") && !request.startsWith("@/")) return require(request);
    const base = request.startsWith("@/") ? resolve(request.slice(2)) : resolve(dirname(file), request);
    const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    if (!target) throw new Error(`Missing module: ${base}`);
    return load(target);
  }, loaded, loaded.exports);
  return loaded.exports;
}

try {
  for (const name of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort())
    await client.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  await client.execute("PRAGMA foreign_keys=ON");
  await client.executeMultiple(`
    INSERT INTO users(id,name,account_role) VALUES ('owner','Owner','user'),('reader','Reader','user'),('outsider','Outside','user');
    INSERT INTO workspaces(id,name) VALUES ('ws','Workspace'),('other-ws','Other');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','reader','viewer'),('other-ws','outsider','owner');
    UPDATE user_subscriptions SET plan_code='business' WHERE user_id='owner';
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('project','ws','Test','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id) VALUES ('project','ws','owner'),('project','ws','reader');
    UPDATE project_members SET role='viewer' WHERE user_id='reader';
  `);
  for (const [id, workspace] of [["owner", "ws"], ["reader", "ws"], ["outsider", "other-ws"]])
    await client.execute({ sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
      args: [id, createHash("sha256").update(`${id}-token`).digest("hex"), id, workspace, new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()] });
  const route = load(resolve("app/api/projects/[projectId]/wbs/schedule/route.ts"));
  const collection = load(resolve("app/api/projects/[projectId]/artifacts/route.ts"));
  const { definitions } = load(resolve("lib/artifact-types.ts"));
  const pure = load(resolve("lib/wbs-schedule.ts"));
  const request = (data) => new Request("http://localhost:3000/api/projects/project/wbs/schedule", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(data) });
  let serial = 0;
  const post = async (data) => route.POST(request({ requestId: `test-request-${String(++serial).padStart(8, "0")}`, deletes: [], changes: [], ...data }), { params: Promise.resolve({ projectId: "project" }) });
  function task(id, type = "작업", parentId = "", progress = "0", effort = "1") {
    return { id, title: id, status: "초안", fields: { ...Object.fromEntries(definitions.wbs.fields.map((field) => [field.key, field.defaultValue ?? ""])), phase: "개발", taskType: type,
      startDate: "2026-10-01", endDate: "2026-10-04", definition: "검증 가능한 작업 범위", plannedEffort: effort, actualEffort: "0", progress, notes: "보존할 비고" },
      links: [], structure: { parentId, dependencies: [] } };
  }
  const data = { requestId: "create-request-00001", changes: [task("temp-parent", "요약"), task("temp-a", "작업", "temp-parent", "100", "3"), task("temp-b", "작업", "temp-parent", "0", "1")], deletes: [] };
  let response = await post(data);
  assert.equal(response.status, 200, await response.clone().text());
  let saved = await response.json();
  const parentId = saved.idMap["temp-parent"], aId = saved.idMap["temp-a"];
  const parent = () => saved.data.artifacts.find((artifact) => artifact.id === parentId);
  assert.equal(parent().fields.progress, "75");
  assert.equal(parent().fields.plannedEffort, "4");
  assert.equal(saved.data.artifacts.find((artifact) => artifact.id === aId).structure.parentId, parentId);
  assert.equal(Number((await client.execute("SELECT count(*) n FROM artifact_revisions")).rows[0].n), 3);
  response = await post(data);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).idMap, saved.idMap);
  assert.equal(Number((await client.execute("SELECT count(*) n FROM project_artifacts")).rows[0].n), 3);
  assert.equal(Number((await client.execute("SELECT count(*) n FROM artifact_revisions")).rows[0].n), 3);
  response = await post({ ...data, changes: [] });
  assert.equal(response.status, 409, "idempotency key cannot be reused for another payload");
  const versions = Object.fromEntries(saved.data.artifacts.map((artifact) => [artifact.id, artifact.version]));
  const a = saved.data.artifacts.find((artifact) => artifact.id === aId);
  response = await post({ versions, changes: [{ id: aId, version: a.version, title: a.title, status: a.status,
    fields: { startDate: "2026-11-01", endDate: "2026-11-04" } }] });
  assert.equal(response.status, 200, await response.clone().text());
  saved = await response.json();
  assert.equal(parent().fields.endDate, "2026-11-04", "final candidate graph allows parent and child expansion atomically");
  assert.equal(parent().version, 2);
  const updated = saved.data.artifacts.find((artifact) => artifact.id === aId);
  assert.equal(updated.fields.notes, "보존할 비고");
  const publications = load(resolve("app/api/projects/[projectId]/wbs/publications/route.ts"));
  const publicationContext = { params: Promise.resolve({ projectId: "project" }) };
  const readPublication = () => publications.GET(new Request("http://localhost:3000/api/projects/project/wbs/publications"), publicationContext);
  const publish = (versions) => publications.POST(request({ versions }), publicationContext);
  const savedVersions = pure.scheduleVersions(saved.data.artifacts);
  response = await publish(savedVersions);
  assert.equal(response.status, 200, await response.clone().text());
  const firstPublication = (await response.json()).publication;
  assert.equal(firstPublication.sequence, 1);
  assert.equal(firstPublication.snapshot.artifacts.find((artifact) => artifact.id === aId).fields.notes, "보존할 비고");
  response = await publish(savedVersions);
  assert.equal((await response.json()).reused, true);
  assert.equal(Number((await client.execute("SELECT count(*) n FROM wbs_schedule_publications")).rows[0].n), 1);
  token = "reader-token";
  response = await readPublication();
  assert.equal(response.status, 200);
  const visible = await response.json();
  assert.equal(visible.canPublish, false);
  assert.equal(visible.publication.id, firstPublication.id);
  assert.equal((await publish(savedVersions)).status, 403);
  token = "outsider-token";
  assert.equal((await readPublication()).status, 404);
  assert.equal((await publish(savedVersions)).status, 404);
  token = "owner-token";
  await client.execute({ sql: "UPDATE project_members SET role='member' WHERE user_id='reader'", args: [] });
  token = "reader-token";
  assert.equal((await publish(savedVersions)).status, 403, "ordinary writer cannot publish");
  token = "owner-token";
  await client.execute("UPDATE project_members SET role='admin' WHERE user_id='reader'");
  token = "reader-token";
  assert.equal((await publish(savedVersions)).status, 200, "project admin may publish");
  token = "owner-token";
  await client.execute("UPDATE project_members SET role='viewer' WHERE user_id='reader'");
  await assert.rejects(client.execute("UPDATE wbs_schedule_publications SET sequence=10"), /immutable/);
  await assert.rejects(client.execute("DELETE FROM wbs_schedule_publications"), /immutable/);
  response = await publish({ ...savedVersions, [aId]: updated.version - 1 });
  assert.equal(response.status, 409);
  const snapshot = await client.execute("SELECT * FROM project_artifacts ORDER BY id");
  response = await post({ changes: [{ ...updated, version: 1, title: "stale" }] });
  assert.equal(response.status, 409);
  response = await post({ changes: [task("temp-valid"), { ...task("temp-invalid"), fields: { ...task("temp-invalid").fields, definition: "" } }] });
  assert.equal(response.status, 400);
  assert.deepEqual((await client.execute("SELECT * FROM project_artifacts ORDER BY id")).rows, snapshot.rows);
  response = await post({ changes: [{ ...updated, fields: { ...updated.fields, taskType: "마일스톤" } }] });
  assert.equal(response.status, 400);
  response = await post({ changes: [{ ...parent(), structure: { parentId: aId } }] });
  assert.equal(response.status, 400);
  for (const identity of ["reader", "outsider"]) {
    token = `${identity}-token`;
    response = await post({}); assert.ok([403, 404].includes(response.status));
  }
  token = "owner-token";
  response = await post({ deletes: [{ id: aId, version: updated.version }] });
  assert.equal(response.status, 409, "automatically changed summary requires its baseline version");
  response = await post({ versions: Object.fromEntries(saved.data.artifacts.map((artifact) => [artifact.id, artifact.version])), deletes: [{ id: parentId, version: parent().version }] });
  assert.equal(response.status, 409, "parent still used by children cannot be deleted");
  response = await post({ versions: Object.fromEntries(saved.data.artifacts.map((artifact) => [artifact.id, artifact.version])), deletes: saved.data.artifacts.map((artifact) => ({ id: artifact.id, version: artifact.version })) });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).data.artifacts.length, 0);
  response = await publish(savedVersions);
  assert.equal(response.status, 400, "empty schedule cannot be published");
  response = await readPublication();
  const frozen = (await response.json()).publication;
  assert.deepEqual(frozen, firstPublication, "deleting working tasks does not alter the published snapshot");
  response = await post({ changes: [task("temp-next-version")] });
  assert.equal(response.status, 200);
  const secondData = (await response.json()).data;
  response = await publish(savedVersions);
  assert.equal(response.status, 409, "new/deleted task set invalidates the prior version map");
  response = await publish(pure.scheduleVersions(secondData.artifacts));
  assert.equal(response.status, 200);
  const secondPublication = (await response.json()).publication;
  assert.equal(secondPublication.sequence, 2);
  response = await readPublication();
  assert.equal((await response.json()).publication.id, secondPublication.id);
  assert.equal(JSON.parse(String((await client.execute({ sql: "SELECT snapshot_json FROM wbs_schedule_publications WHERE id=?", args: [firstPublication.id] })).rows[0].snapshot_json)).artifacts.length, 3);
  response = await post({ deletes: secondData.artifacts.map((artifact) => ({ id: artifact.id, version: artifact.version })) });
  assert.equal(response.status, 200);
  assert.equal(Number((await client.execute("SELECT count(*) n FROM artifact_links")).rows[0].n), 0);
  response = await collection.GET(new Request("http://localhost:3000/api/projects/project/artifacts"), { params: Promise.resolve({ projectId: "project" }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).artifacts.length, 0, "empty project never receives sample tasks");
  assert.equal(pure.scheduleDate(pure.scheduleDay("2024-02-28") + 1), "2024-02-29");
  assert.equal(pure.scheduleDate(pure.scheduleDay("2026-12-31") + 1), "2027-01-01");
  assert.throws(() => pure.scheduleDay("2026-02-29"));
  const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
  const { WbsOverview } = load(resolve("components/pages/wbs/wbs-overview.tsx"));
  const svg = renderToStaticMarkup(React.createElement(WbsOverview, { tasks: [{ id: "a", title: "Task", wbs: "WBS-001", startDate: "2026-10-01", endDate: "2026-10-02", progress: 50 }], start: "2026-09-30", days: 34, expanded: true }));
  assert.ok(svg.indexOf('data-layer="background"') < svg.indexOf('data-layer="labels"'));
  assert.match(svg, /2026-10/);
  assert.match(svg, /preserveAspectRatio="xMinYMin meet"/);
  console.log("PASS: WBS atomic saves, summary aggregation, idempotent retry, permissions/conflicts, date/SVG behavior; owner/admin publication, member view, stale/empty rejection, duplicate reuse, immutable snapshots and latest publication");
} finally {
  client.close();
  cache.get(resolve("lib/db.ts"))?.exports.db().close();
}

