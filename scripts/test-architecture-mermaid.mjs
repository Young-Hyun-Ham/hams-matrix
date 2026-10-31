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


const folder = await mkdtemp(join(tmpdir(), "matrix-architecture-mermaid-"));
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

const originalFetch = globalThis.fetch;
process.env.OPENAI_MODELS = "gpt-test";
let calls = 0, mode = "success", duringGeneration;
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://api.openai.com/v1/responses");
  calls++;
  const payload = JSON.parse(init.body);
  const source = JSON.parse(payload.input);
  assert.equal(source.owner, undefined);
  assert.equal(source.topology.nodes.length, 2);
  if (duringGeneration) await duringGeneration();
  if (mode === "timeout") throw new Error("mock transport timeout");
  if (mode === "failure") return Response.json({ error: "mock failure" }, { status: 502 });
  const order = { nodeIds: source.topology.nodes.map((node) => node.id).reverse(), edgeIds: source.topology.edges.map((edge) => edge.id) };
  if (mode === "missing") order.nodeIds.pop();
  if (mode === "extra") order.edgeIds.push("invented");
  return Response.json({ id: `response-${calls}`, status: "completed",
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    output: [{ type: "message", content: [{ type: "output_text", text: mode === "syntax" ? "not JSON" : JSON.stringify(order) }] }] });
};

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
  const collection = load(resolve("app/api/projects/[projectId]/artifacts/route.ts"));
  const item = load(resolve("app/api/projects/[projectId]/artifacts/[artifactId]/route.ts"));
  const pure = load(resolve("lib/architecture-mermaid.ts"));
  const topology = { nodes: [
    { id: "api-uuid", name: 'API "한글" <script>', technology: "Spring (6)\nJava & SQL", layer: "backend", shape: "service" },
    { id: "db-uuid", name: "DB", technology: "PostgreSQL", layer: "data", shape: "database" },
  ], edges: [{ id: "edge-uuid", source: "api-uuid", target: "db-uuid", label: 'SQL | "쓰기"' }] };
  const base = { kind: "architecture", title: "Architecture", status: "초안",
    fields: { definition: "시스템 구성", owner: "담당자", notes: "비고" }, links: [], structure: { topology } };
  const request = (method, data) => new Request("http://localhost:3000/api/projects/project/artifacts", {
    method, headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(data),
  });
  const create = async (data = base) => collection.POST(request("POST", data), { params: Promise.resolve({ projectId: "project" }) });
  const patch = async (id, data) => item.PATCH(request("PATCH", data), { params: Promise.resolve({ projectId: "project", artifactId: id }) });
  const count = async () => Number((await client.execute("SELECT count(*) AS n FROM project_artifacts")).rows[0].n);
  const read = async (id) => (await client.execute({ sql: "SELECT * FROM project_artifacts WHERE id=?", args: [id] })).rows[0];

  let response = await create();
  assert.equal(response.status, 201, await response.clone().text());
  let saved = (await response.json()).artifact;
  assert.equal(calls, 1);
  assert.deepEqual(saved.structure.topology, topology);
  assert.ok(pure.isSafeArchitectureMermaid(saved.structure.mermaid.code));
  assert.ok(!saved.structure.mermaid.code.includes("<script>"));
  assert.match(saved.structure.mermaid.code, /n1 -->\|".*"\| n0/);
  assert.equal(JSON.parse((await read(saved.id)).structure_json).mermaid.code, saved.structure.mermaid.code);
  assert.equal(Number((await client.execute("SELECT count(*) AS n FROM artifact_revisions")).rows[0].n), 1);
  assert.equal(Number((await client.execute("SELECT count(*) AS n FROM ai_token_usage WHERE usage_known=1")).rows[0].n), 1);

  await client.execute({ sql: "UPDATE project_artifacts SET fields_json=? WHERE id=?",
    args: [JSON.stringify({ ...saved.fields, frameworks: "Legacy framework", security: "Legacy security" }), saved.id] });
  response = await patch(saved.id, { ...base, version: saved.version, status: "검토 중",
    structure: { topology, mermaid: { code: "evil", sourceHash: "forged" } } });
  assert.equal(response.status, 200, await response.clone().text());
  saved = (await response.json()).artifact;
  assert.equal(calls, 1, "status-only save reuses generated code");
  assert.equal(saved.fields.frameworks, "Legacy framework");
  assert.equal(saved.fields.security, "Legacy security");
  const { exportSheets } = load(resolve("lib/workbook.ts"));
  const sheet = exportSheets({ project: { id: "project", name: "Test" }, artifacts: [saved], revisions: [] }).find((sheet) => sheet.name === "아키텍처정의서");
  assert.ok(sheet.rows[0].includes("보안 기준"));
  assert.ok(sheet.rows[1].includes("Legacy security"));
  assert.ok(pure.isSafeArchitectureMermaid(saved.structure.mermaid.code));
  const before = await read(saved.id);
  for (const failure of ["failure", "timeout", "missing", "extra", "syntax"]) {
    mode = failure;
    response = await patch(saved.id, { ...base, title: failure, version: saved.version });
    assert.ok([502, 504].includes(response.status), `${failure}: ${await response.text()}`);
    assert.deepEqual(await read(saved.id), before, "failed generation preserves original and code");
  }
  const currentCount = await count();
  response = await create({ ...base, title: "Failed new" });
  assert.equal(response.status, 502);
  assert.equal(await count(), currentCount);
  mode = "success";
  const paidBefore = calls;
  for (const identity of ["reader", "outsider"]) {
    token = `${identity}-token`;
    response = await patch(saved.id, { ...base, version: saved.version });
    assert.ok([403, 404].includes(response.status));
  }
  token = "owner-token";
  response = await patch(saved.id, { ...base, version: 0 });
  assert.equal(response.status, 409);
  response = await create({ ...base, structure: { topology: { nodes: [], edges: topology.edges } } });
  assert.equal(response.status, 400);
  assert.equal(calls, paidBefore, "access, version and topology checked before generation");

  duringGeneration = async () => {
    await client.execute({ sql: "UPDATE project_artifacts SET version=version+1 WHERE id=?", args: [saved.id] });
  };
  response = await patch(saved.id, { ...base, title: "Conflict", version: saved.version });
  assert.equal(response.status, 409);
  assert.equal((await read(saved.id)).title, saved.title);
  duringGeneration = undefined;
  const emptyBefore = calls;
  response = await create({ ...base, title: "Empty", structure: { topology: { nodes: [], edges: [] } } });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).artifact.structure.mermaid.code, "flowchart TD");
  assert.equal(calls, emptyBefore);

  for (const bad of ["flowchart TD\n  click n0 \"https://evil\"", "%%{init: {}}%%\nflowchart TD", "sequenceDiagram", 'flowchart TD\n    n0["<img src=x onerror=alert(1)>"]'])
    assert.equal(pure.isSafeArchitectureMermaid(bad), false);
  assert.throws(() => pure.validateMermaidOrder({ nodeIds: ["api-uuid", "api-uuid"], edgeIds: ["edge-uuid"] }, topology));
  const getBefore = calls;
  response = await collection.GET(new Request("http://localhost:3000/api/projects/project/artifacts"), { params: Promise.resolve({ projectId: "project" }) });
  assert.equal(response.status, 200);
  assert.equal(calls, getBefore, "read never generates");

  // AI chat uses the same generation outside its rollback-only preview, then
  // commits the prepared, trusted metadata in its final transaction.
  const { createPageAgent } = load(resolve("lib/ai/page-tools.ts"));
  const { aiPages } = load(resolve("lib/ai/page-prompts.ts"));
  const user = { id: "owner", workspaceId: "ws", name: "Owner", role: "owner", accountRole: "user", onboardingComplete: true };
  const agent = createPageAgent(request("POST", {}), user, { projectId: "project" }, aiPages.architecture, true, "아키텍처 등록해줘");
  const aiInput = { ...base };
  delete aiInput.kind;
  const pending = await agent.execute("save_artifact", { ...aiInput, action: "CREATE", title: "AI architecture" });
  assert.equal(pending.success, true, JSON.stringify(pending));
  const tx = await client.transaction("write");
  try { await agent.commit(tx); await tx.commit(); } finally { tx.close(); }
  const aiRow = (await client.execute("SELECT structure_json FROM project_artifacts WHERE title='AI architecture'")).rows[0];
  assert.ok(pure.isSafeArchitectureMermaid(JSON.parse(aiRow.structure_json).mermaid.code));
  // The editable flowchart is independent of the generated SVG topology.
  response = await create();
  assert.equal(response.status, 201);
  const editableArtifact = (await response.json()).artifact;
  const editable = load(resolve("app/api/projects/[projectId]/artifacts/[artifactId]/mermaid/route.ts"));
  const edit = (code, version = editableArtifact.version) => editable.PATCH(request("PATCH", { code, version }), { params: Promise.resolve({ projectId: "project", artifactId: editableArtifact.id }) });
  const customCode = 'graph TD\n  %% 노드 스타일 정의\n  classDef client fill:#e1f5fe,stroke:#0288d1,color:#fff;\n  subgraph ClientLayer ["1. Client Layer"]\n    Browser["Web Browser (React/Next.js)"]:::client\n  end\n  Browser -->|HTTPS / JSON| API["API Server"]';
  assert.equal(pure.editableMermaidError(customCode), null);
  const paidAtEdit = calls;
  response = await edit(customCode);
  assert.equal(response.status, 200, await response.clone().text());
  const custom = (await response.json()).artifact;
  assert.equal(custom.structure.mermaid.code, customCode);
  assert.equal(custom.structure.mermaid.generatorVersion, "manual-flowchart-v1");
  assert.deepEqual(custom.structure.topology, editableArtifact.structure.topology);
  assert.equal(calls, paidAtEdit, "manual save never calls AI");
  assert.equal(JSON.parse((await read(custom.id)).structure_json).mermaid.code, customCode);
  response = await edit(customCode, custom.version);
  assert.equal((await response.json()).artifact.version, custom.version, "identical save is a no-op");
  assert.equal((await edit(customCode)).status, 409, "stale version cannot overwrite manual code");
  token = "reader-token";
  assert.equal((await edit(customCode, custom.version)).status, 403);
  token = "outsider-token";
  assert.equal((await edit(customCode, custom.version)).status, 404);
  token = "owner-token";
  for (const bad of ['flowchart TD\n click Browser "https://example.com"', '%%{init:{securityLevel:"loose"}}%%\ngraph TD', 'graph TD\n A["<img src=x>"]', 'sequenceDiagram', 'graph TD\n A@{ img:"//evil/image" }']) {
    assert.ok(pure.editableMermaidError(bad));
    assert.equal((await edit(bad, custom.version)).status, 400);
  }
  response = await patch(custom.id, { ...base, version: custom.version, status: "검토 중" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).artifact.structure.mermaid.code, customCode, "ordinary metadata save preserves custom code");
  assert.equal(calls, paidAtEdit);
  response = await patch(custom.id, { ...base, version: custom.version + 1, title: "Changed diagram source" });
  assert.equal(response.status, 200, await response.clone().text());
  assert.ok(pure.isSafeArchitectureMermaid((await response.json()).artifact.structure.mermaid.code));
  assert.equal(calls, paidAtEdit + 1, "source changes regenerate the derived code");
  console.log("PASS: reduced fields, legacy preservation, atomic Mermaid persistence/reload/history, token usage, reuse, failure/timeout/invalid topology, permissions, version conflict, safe grammar, empty topology and AI chat mutation");
  console.log("PASS: manual graph/classDef/subgraph save/reload, unchanged topology, no AI call, no-op save, version and tenant/role enforcement, unsafe code rejection, custom preservation and source regeneration");
} finally {
  globalThis.fetch = originalFetch;
  client.close();
  cache.get(resolve("lib/db.ts"))?.exports.db().close();
}

