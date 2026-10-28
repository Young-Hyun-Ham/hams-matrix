// Real route handlers, authorization, SQLite migrations and encryption. Only Next's request
// cookie context and the external OpenAI provider are replaced; no paid requests are made.
import assert from "node:assert/strict";
import { createHash, createCipheriv } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import ts from "typescript";
import { checkWbsImages } from "./check-wbs-images.mjs";

const folder = await mkdtemp(join(tmpdir(), "matrix-architecture-images-"));
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
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQIoAAAAASUVORK5CYII=";
let generations = 0, modelQueries = 0, failProvider = false, onGeneration;
let generationInput;
globalThis.fetch = async (url, init) => {
  assert.equal(init.headers.Authorization, "Bearer test-key");
  if (url === "https://api.openai.com/v1/models") {
    modelQueries++;
    return Response.json({ data: ["gpt-5.6-sol", "gpt-image-1", "gpt-image-1.5", "gpt-image-2.5-sunburst", "chatgpt-image-latest"].map((id) => ({ id })) });
  }
  assert.equal(url, "https://api.openai.com/v1/images/generations");
  generations++;
  generationInput = JSON.parse(init.body);
  if (onGeneration) await onGeneration();
  return failProvider ? new Response("provider failed", { status: 502 }) : Response.json({ data: [{ b64_json: png }] });
};

try {
  for (const name of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort())
    await client.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  await client.execute("PRAGMA foreign_keys=ON");
  await client.executeMultiple(`
    INSERT INTO users(id,name,account_role) VALUES ('owner','소유자','user'),('reader','조회자','user'),('outsider','외부 사용자','user');
    INSERT INTO workspaces(id,name) VALUES ('ws','워크스페이스'),('other-ws','다른 워크스페이스');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','reader','viewer'),('other-ws','outsider','owner');
    UPDATE user_subscriptions SET plan_code='business' WHERE user_id='owner';
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('project','ws','검증 프로젝트','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id) VALUES ('project','ws','owner'),('project','ws','reader');
    UPDATE project_members SET role='viewer' WHERE user_id='reader';
  `);
  for (const [id, workspace] of [["owner", "ws"], ["reader", "ws"], ["outsider", "other-ws"]]) {
    await client.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
      args: [id, createHash("sha256").update(`${id}-token`).digest("hex"), id, workspace, new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()],
    });
  }
  const fields = { definition: "웹 클라이언트 → 프록시 → API → DB", languages: "Python 3.12", frameworks: "FastAPI 0.115", database: "PostgreSQL 16", servers: "Nginx", security: "JWT", performance: "응답 1초 이내", standards: "REST API" };
  const topology = { nodes: [
    { id: "api", name: "Backend API", technology: "FastAPI 0.115", layer: "backend", shape: "service" },
    { id: "db", name: "PostgreSQL", technology: "PostgreSQL 16", layer: "data", shape: "database" },
  ], edges: [{ id: "sql", source: "api", target: "db", label: "ORM / SQL" }] };
  await client.execute({
    sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES ('arc','ws','project','architecture','ARC-001','풀스택 구성도','초안',?,?,1,'owner','owner','now','now')",
    args: [JSON.stringify(fields), JSON.stringify({ topology })],
  });
  const root = "/api/projects/project/artifacts/arc/image";
  const route = load(resolve("app/api/projects/[projectId]/artifacts/[artifactId]/image/route.ts"));
  const content = load(resolve("app/api/projects/[projectId]/artifacts/[artifactId]/image/content/route.ts"));
  const modelRoute = load(resolve("app/api/ai/image-models/route.ts"));
  const context = { params: Promise.resolve({ projectId: "project", artifactId: "arc" }) };
  const get = () => route.GET(new Request(`http://localhost:3000${root}`), context);
  const input = { model: "gpt-image-2.5-sunburst", prompt: "연결선과 인프라 경계를 강조", artifactVersion: 1 };
  const post = (extra = {}, origin = "http://localhost:3000") => route.POST(new Request(`http://localhost:3000${root}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ ...input, ...extra }),
  }), context);
  const bytes = (url) => content.GET(new Request(`http://localhost:3000${url}`), context);
  const stored = async () => (await client.execute("SELECT * FROM architecture_images WHERE artifact_id='arc'")).rows[0];
  const locks = async () => (await client.execute("SELECT * FROM architecture_image_generations")).rows.length;
  token = "";
  assert.equal((await get()).status, 401);
  assert.equal((await modelRoute.GET()).status, 401);
  token = "reader-token";
  assert.equal((await get()).status, 200);
  assert.equal((await post()).status, 403);
  token = "outsider-token";
  assert.equal((await get()).status, 404);
  token = "owner-token";
  assert.deepEqual(await (await get()).json(), { image: null });
  const models = await (await modelRoute.GET()).json();
  assert.ok(models.models.includes(input.model));
  assert.ok(!models.models.includes("gpt-image-1") && !models.models.includes("gpt-5.6-sol"));
  assert.equal((await post({}, "https://other.example")).status, 403);
  assert.equal((await post({ model: "gpt-5.6-sol" })).status, 400);
  assert.equal((await post({ artifactVersion: 99 })).status, 409);
  const key = process.env.AI_IMAGE_ENCRYPTION_KEY;
  process.env.AI_IMAGE_ENCRYPTION_KEY = "";
  assert.equal((await post()).status, 503);
  process.env.AI_IMAGE_ENCRYPTION_KEY = key;
  assert.equal(generations, 0);

  const createdResponse = await post();
  assert.equal(createdResponse.status, 200, await createdResponse.clone().text());
  const first = (await createdResponse.json()).image;
  assert.equal(generationInput.size, "1536x1024");
  assert.equal(generationInput.quality, "high");
  for (const value of ["FastAPI 0.115", "PostgreSQL 16", "ORM / SQL", "연결선과 인프라 경계를 강조", '"source":"api"', "SOFTWARE SYSTEM ARCHITECTURE DIAGRAM", "side by side"])
    assert.ok(generationInput.prompt.includes(value), value);
  assert.ok(!JSON.stringify(first).includes(png));
  const saved = await stored();
  assert.notEqual(saved.ciphertext_base64, png);
  assert.equal(Buffer.from(saved.iv_base64, "base64").length, 12);
  assert.equal(Buffer.from(saved.tag_base64, "base64").length, 16);
  assert.equal(await locks(), 0);
  const original = await bytes(first.url);
  assert.equal(original.status, 200);
  assert.ok(original.headers.get("cache-control").includes("no-store"));
  assert.equal(Buffer.from(await original.arrayBuffer()).toString("base64"), png);
  const download = await bytes(`${first.url}&download=1`);
  assert.ok(download.headers.get("content-disposition").startsWith("attachment"));
  assert.equal(Buffer.from(await download.arrayBuffer()).toString("base64"), png);
  token = "reader-token";
  assert.equal((await bytes(first.url)).status, 200);
  assert.equal((await post({ regenerate: true, expectedImageId: first.id })).status, 403);
  token = "outsider-token";
  assert.equal((await bytes(first.url)).status, 404);
  token = "owner-token";
  const callsBeforeReuse = generations, queriesBeforeReuse = modelQueries;
  assert.equal((await (await post()).json()).reused, true);
  await get();
  await bytes(first.url);
  assert.equal(generations, callsBeforeReuse);
  assert.equal(modelQueries, queriesBeforeReuse);
  const regen = { regenerate: true, expectedImageId: first.id };
  assert.equal((await post({ ...regen, expectedImageId: "old" })).status, 409);
  await client.execute("UPDATE architecture_images SET model='tampered' WHERE artifact_id='arc'");
  assert.equal((await bytes(first.url)).status, 500);
  await client.execute({ sql: "UPDATE architecture_images SET model=? WHERE artifact_id='arc'", args: [saved.model] });
  const corrupted = Buffer.from(saved.ciphertext_base64, "base64"); corrupted[0] ^= 1;
  await client.execute({ sql: "UPDATE architecture_images SET ciphertext_base64=? WHERE artifact_id='arc'", args: [corrupted.toString("base64")] });
  assert.equal((await bytes(first.url)).status, 500);
  await client.execute({ sql: "UPDATE architecture_images SET ciphertext_base64=? WHERE artifact_id='arc'", args: [saved.ciphertext_base64] });
  failProvider = true;
  assert.equal((await post(regen)).status, 502);
  failProvider = false;
  assert.equal((await stored()).id, first.id);
  assert.equal(await locks(), 0);
  await client.execute("CREATE TRIGGER fail_image_save BEFORE UPDATE ON architecture_images BEGIN SELECT RAISE(ABORT,'save failure'); END");
  assert.equal((await post(regen)).status, 500);
  assert.equal((await stored()).id, first.id);
  await client.execute("DROP TRIGGER fail_image_save");
  assert.equal(await locks(), 0);
  let started, resume;
  const beginning = new Promise((resolve) => { started = resolve; });
  onGeneration = async () => { started(); await new Promise((resolve) => { resume = resolve; }); };
  const pending = post(regen);
  await beginning;
  const countWhilePending = generations;
  assert.equal((await post(regen)).status, 409);
  assert.equal(generations, countWhilePending);
  resume();
  const secondResponse = await pending;
  assert.equal(secondResponse.status, 200, await secondResponse.clone().text());
  const second = (await secondResponse.json()).image;
  assert.notEqual(second.id, first.id);
  assert.notEqual((await stored()).iv_base64, saved.iv_base64);
  assert.equal((await bytes(first.url)).status, 404);
  assert.equal((await bytes(second.url)).status, 200);
  onGeneration = async () => { await client.execute("UPDATE project_artifacts SET version=2 WHERE id='arc'"); };
  assert.equal((await post({ regenerate: true, expectedImageId: second.id })).status, 409);
  assert.equal((await stored()).id, second.id);
  assert.equal((await (await get()).json()).image.artifactVersion, 1);
  assert.equal(await locks(), 0);
  await client.execute("UPDATE project_artifacts SET deleted_at='now' WHERE id='arc'");
  assert.equal((await get()).status, 404);
  assert.equal((await bytes(second.url)).status, 404);
  await client.execute("UPDATE project_artifacts SET deleted_at=NULL WHERE id='arc'");
  await client.execute("DELETE FROM project_members WHERE project_id='project' AND user_id='reader'");
  token = "reader-token";
  assert.equal((await bytes(second.url)).status, 404);
  token = "owner-token";

  const { architectureImagePrompt } = load(resolve("lib/ai/architecture-image-prompt.ts"));
  const largeTopology = { nodes: Array.from({ length: 30 }, (_, i) => ({ ...topology.nodes[0], id: `node-${i}`, technology: "기술 설명".repeat(600) })), edges: [] };
  const largePrompt = architectureImagePrompt({ code: "ARC-002", title: "대규모 시스템", version: 1, fields: Object.fromEntries(Object.keys(fields).map((key) => [key, "설명".repeat(1500)])), structure: { topology: largeTopology } }, "테스트");
  assert.ok(largePrompt.length <= 32000);
  for (const node of largeTopology.nodes) assert.ok(largePrompt.includes(`"id":"${node.id}"`));

  // The shared encryption helper preserves the existing chat attachment format and AAD.
  const chat = load(resolve("lib/ai/chat-images.ts"));
  const scope = { chatId: "chat", workspaceId: "ws", userId: "owner", projectId: "project" };
  const encryptedChat = chat.encryptAiImages(chat.validateAiImages([{ dataUrl: `data:image/png;base64,${png}` }]), scope);
  const args = encryptedChat.statements[0].args;
  const chatRow = Object.fromEntries(["id", "chat_id", "workspace_id", "user_id", "position", "mime_type", "byte_length", "width", "height", "key_id", "iv_base64", "tag_base64", "ciphertext_base64"].map((key, i) => [key, args[i]]));
  chatRow.encryption_version = 1;
  assert.equal(chat.decryptAiImage(chatRow, scope).toString("base64"), png);
  assert.throws(() => chat.decryptAiImage(chatRow, { ...scope, workspaceId: "other" }));
  const legacyIv = Buffer.alloc(12, 19);
  const legacyCipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), legacyIv);
  legacyCipher.setAAD(Buffer.from(JSON.stringify([1, scope.chatId, scope.workspaceId, scope.userId, scope.projectId,
    chatRow.id, chatRow.mime_type, chatRow.byte_length, chatRow.width, chatRow.height])));
  const legacyBytes = Buffer.concat([legacyCipher.update(Buffer.from(png, "base64")), legacyCipher.final()]);
  assert.equal(chat.decryptAiImage({ ...chatRow, iv_base64: legacyIv.toString("base64"), tag_base64: legacyCipher.getAuthTag().toString("base64"), ciphertext_base64: legacyBytes.toString("base64") }, scope).toString("base64"), png);
  console.log("PASS: migrations, real authorization, model selection, architecture prompt, encrypted persistence, shared preview/download, reuse without AI calls, tamper rejection, regeneration failure preservation, duplicate lock and source-version checks");
  await checkWbsImages({ client, load, png, setToken: (value) => { token = value; }, provider: {
    calls: () => generations, input: () => generationInput,
    setFailure: (value) => { failProvider = value; }, setCallback: (value) => { onGeneration = value; },
  } });
} finally {
  globalThis.fetch = originalFetch;
  client.close();
  cache.get(resolve("lib/db.ts"))?.exports.db().close();
}
