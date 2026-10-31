// Real route handlers and database; replace only Next request cookies and the external S3 service.
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
import { checkOnlyoffice } from "./check-onlyoffice.mjs";

const directory = await mkdtemp(join(tmpdir(), "matrix-documents-"));
process.env.TURSO_DATABASE_URL = pathToFileURL(join(directory, "test.db")).href;
process.env.TURSO_AUTH_TOKEN = "";
process.env.APP_URL = "http://localhost:3000";
Object.assign(process.env, { R2_ENDPOINT: "https://test.r2.cloudflarestorage.com", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test", R2_BUCKET_NAME: "private-test" });
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
const require = createRequire(import.meta.url), cache = new Map(), objects = new Map();
let token = "owner-token", failStorage = false, onPut;
class PutObjectCommand { constructor(input) { this.input = input; } }
class GetObjectCommand extends PutObjectCommand {}
class DeleteObjectCommand extends PutObjectCommand {}
class S3Client {
  constructor(config) { assert.equal(config.region, "auto"); }
  destroy() {}
  async send(command) {
    const input = command.input;
    assert.equal(input.Bucket, "private-test");
    if (failStorage) throw new Error("StorageUnavailable");
    if (command instanceof GetObjectCommand) {
      assert.ok(objects.has(input.Key));
      return { Body: { transformToByteArray: async () => objects.get(input.Key) } };
    }
    if (command instanceof DeleteObjectCommand) { objects.delete(input.Key); return {}; }
    objects.set(input.Key, input.Body);
    if (onPut) await onPut();
    return {};
  }
}
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} }; cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)((request) => {
    if (request === "server-only") return {};
    if (request === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
    if (request === "next/server") return { connection: async () => {} };
    if (request === "@aws-sdk/client-s3") return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
    if (!request.startsWith(".") && !request.startsWith("@/")) return require(request);
    const base = request.startsWith("@/") ? resolve(request.slice(2)) : resolve(dirname(file), request);
    const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    if (!target) throw new Error(`Missing module: ${base}`);
    return load(target);
  }, loaded, loaded.exports);
  return loaded.exports;
}

try {
  for (const name of (await readdir("db/migrations")).filter(n => n.endsWith(".sql")).sort())
    await client.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  await client.executeMultiple(`
    INSERT INTO users(id,name,account_role) VALUES ('owner','소유자','user'),('reader','조회자','user'),('outsider','외부인','user');
    INSERT INTO workspaces(id,name) VALUES ('ws','작업공간'),('other','다른 작업공간');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','reader','viewer'),('other','outsider','owner');
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('project','ws','프로젝트','owner','owner'),('second','ws','두번째','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id) VALUES ('project','ws','owner'),('project','ws','reader'),('second','ws','owner');
    UPDATE admin_setting SET value_json='true' WHERE setting_key='DB_LOGGING_ENABLED';
  `);
  for (const [id, ws] of [["owner", "ws"], ["reader", "ws"], ["outsider", "other"]]) {
    await client.execute({ sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)", args: [id, createHash("sha256").update(`${id}-token`).digest("hex"), id, ws, new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()] });
  }
  const route = load(resolve("app/api/projects/[projectId]/documents/route.ts"));
  const uploadRoute = load(resolve("app/api/projects/[projectId]/documents/files/route.ts"));
  const downloadRoute = load(resolve("app/api/projects/[projectId]/documents/files/[fileId]/route.ts"));
  const ctx = (projectId = "project", fileId) => ({ params: Promise.resolve({ projectId, fileId }) });
  const url = "http://localhost:3000/api/projects/project/documents";
  const list = (folderId = "", projectId) => route.GET(new Request(`${url}?${new URLSearchParams({ folderId })}`), ctx(projectId));
  const folder = (method, input, projectId, origin = process.env.APP_URL) => route[method](new Request(url, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(input) }), ctx(projectId));
  const upload = (name, folderId = "", bytes = "document bytes", projectId, headers = {}) => uploadRoute.POST(new Request(`${url}/files?${new URLSearchParams({ name, folderId })}`, { method: "POST", headers: { Origin: process.env.APP_URL, ...headers }, body: bytes }), ctx(projectId));
  const download = (id, projectId) => downloadRoute.GET(new Request(`${url}/files/${id}`), ctx(projectId, id));
  const mutateFile = (method, id, input = {}, projectId, origin = process.env.APP_URL) => downloadRoute[method](new Request(`${url}/files/${id}`, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(input) }), ctx(projectId, id));
  token = ""; assert.equal((await list()).status, 401);
  token = "reader-token";
  assert.equal((await list()).status, 200);
  assert.equal((await folder("POST", { name: "금지" })).status, 403);
  assert.equal((await upload("금지.txt")).status, 403);
  token = "outsider-token"; assert.equal((await list()).status, 404);
  token = "owner-token";
  assert.equal((await folder("POST", { name: "폴더" }, undefined, "https://evil.example")).status, 403);
  assert.equal((await folder("POST", { name: "../폴더" })).status, 400);
  assert.equal((await folder("POST", { name: " " })).status, 400);
  const created = await folder("POST", { name: "설계" }); assert.equal(created.status, 201);
  const parent = (await created.json()).id;
  assert.equal((await folder("POST", { name: "설계" })).status, 409);
  const nested = (await (await folder("POST", { name: "상세", parentId: parent })).json()).id;
  assert.equal((await folder("DELETE", { id: parent })).status, 409);
  assert.equal((await folder("POST", { name: "외부", parentId: parent }, "second")).status, 404);
  assert.equal((await upload("외부.txt", parent, "bytes", "second")).status, 404);
  assert.equal((await list(parent, "second")).status, 404);
  assert.equal((await upload("empty.txt", parent, "")).status, 400);
  assert.equal((await upload("large.txt", parent, "bytes", undefined, { "Content-Length": String(20 * 1024 * 1024 + 1) })).status, 413);
  assert.equal((await upload("large.txt", parent, Buffer.alloc(20 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await upload("../path.txt", parent)).status, 400);
  assert.equal(objects.size, 0);
  const filename = "설계 문서(최종).docx";
  const fileResponse = await upload(filename, parent); assert.equal(fileResponse.status, 201);
  const file = (await fileResponse.json()).id;
  assert.equal((await upload(filename, parent)).status, 201);
  assert.equal(objects.size, 2);
  assert.equal((await (await list(parent)).json()).files.length, 2);
  let keys = [...objects.keys()];
  assert.equal((await folder("PATCH", { id: parent, name: "새 이름" })).status, 200);
  assert.deepEqual([...objects.keys()], keys);
  const downloaded = await download(file); assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), "document bytes");
  assert.equal(downloaded.headers.get("Content-Type"), "application/octet-stream");
  assert.ok(downloaded.headers.get("Content-Disposition").includes(encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)));
  token = "reader-token"; assert.equal((await download(file)).status, 200);
  assert.equal((await folder("PATCH", { id: parent, name: "불가" })).status, 403);
  assert.equal((await folder("DELETE", { id: nested })).status, 403);
  token = "outsider-token"; assert.equal((await download(file)).status, 404);
  token = "owner-token";
  assert.equal((await download(file, "second")).status, 404);
  assert.equal((await download("unknown")).status, 404);
  assert.equal((await folder("DELETE", { id: nested })).status, 200);
  assert.equal((await folder("DELETE", { id: parent })).status, 409);
  const disappearing = (await (await folder("POST", { name: "삭제 경쟁" })).json()).id;
  onPut = async () => { assert.equal((await folder("DELETE", { id: disappearing })).status, 200); };
  assert.equal((await upload("race.txt", disappearing)).status, 404);
  assert.equal(objects.size, 2, "failed database insert must clean up the R2 object");
  onPut = undefined; failStorage = true;
  assert.equal((await upload("failed.txt")).status, 500);
  assert.equal((await client.execute("SELECT COUNT(*) AS n FROM project_files")).rows[0].n, 2);
  failStorage = false;
  const original = process.env.R2_ACCESS_KEY_ID; delete process.env.R2_ACCESS_KEY_ID;
  assert.equal((await upload("missing-config.txt")).status, 503);
  process.env.R2_ACCESS_KEY_ID = original;
  await checkOnlyoffice({ load, client, file, objects, setToken: value => { token = value; }, setFailStorage: value => { failStorage = value; } });
  keys = [...objects.keys()];
  // File edits must retain the object key and enforce the same scope and writer rules.
  const renamed = "새 파일명.xlsx";
  assert.equal((await mutateFile("PATCH", file, { name: renamed })).status, 200);
  assert.equal((await (await list(parent)).json()).files.find(f => f.id === file).name, renamed);
  assert.deepEqual([...objects.keys()], keys);
  const renamedDownload = await download(file);
  assert.ok(renamedDownload.headers.get("Content-Disposition").includes(encodeURIComponent(renamed)));
  assert.equal(await renamedDownload.text(), "document bytes");
  for (const name of ["", "../bad", "x".repeat(256)])
    assert.equal((await mutateFile("PATCH", file, { name })).status, 400);
  for (const method of ["PATCH", "DELETE"]) {
    assert.equal((await mutateFile(method, file, { name: "bad" }, undefined, "https://evil.example")).status, 403);
    assert.equal((await mutateFile(method, file, { name: "bad" }, "second")).status, 404);
    assert.equal((await mutateFile(method, "unknown", { name: "bad" })).status, 404);
    token = "";
    assert.equal((await mutateFile(method, file, { name: "bad" })).status, 401);
    token = "reader-token";
    assert.equal((await mutateFile(method, file, { name: "bad" })).status, 403);
    token = "outsider-token";
    assert.equal((await mutateFile(method, file, { name: "bad" })).status, 404);
    token = "owner-token";
  }
  failStorage = true;
  assert.equal((await mutateFile("DELETE", file)).status, 500);
  assert.equal(objects.size, 2);
  assert.equal((await (await list(parent)).json()).files.length, 2);
  failStorage = false;
  assert.equal((await mutateFile("DELETE", file)).status, 200);
  assert.equal(objects.size, 1);
  assert.equal((await download(file)).status, 404);
  const remaining = (await (await list(parent)).json()).files;
  assert.equal(remaining.length, 1);
  assert.equal((await mutateFile("DELETE", remaining[0].id)).status, 200);
  assert.equal(objects.size, 0);
  assert.equal((await folder("DELETE", { id: parent })).status, 200);
  const audits = (await client.execute("SELECT action,resource_type FROM audit_logs WHERE resource_type IN ('project_folder','project_file')")).rows;
  assert.ok(audits.some(r => r.action === "CREATE" && r.resource_type === "project_file"));
  assert.ok(audits.some(r => r.action === "READ"));
  assert.ok(audits.some(r => r.action === "UPDATE"));
  assert.ok(audits.some(r => r.action === "DELETE"));
  assert.ok(audits.some(r => r.action === "UPDATE" && r.resource_type === "project_file"));
  assert.ok(audits.some(r => r.action === "DELETE" && r.resource_type === "project_file"));
  console.log("PASS documents: folder/file management, nested scopes, upload/download bytes, limits, authorization, audit and failure cleanup");
} finally {
  cache.get(resolve("lib/db.ts"))?.exports.db().close();
  client.close();
}
