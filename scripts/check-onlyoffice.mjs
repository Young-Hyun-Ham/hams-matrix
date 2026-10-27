import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkOnlyoffice({ load, client, file, setToken, setFailStorage, objects }) {
  const configRoute = load(resolve("app/api/projects/[projectId]/documents/files/[fileId]/editor/route.ts"));
  const contentRoute = load(resolve("app/api/projects/[projectId]/documents/files/[fileId]/editor/content/route.ts"));
  const callbackRoute = load(resolve("app/api/projects/[projectId]/documents/files/[fileId]/editor/callback/route.ts"));
  const lib = load(resolve("lib/onlyoffice.ts"));
  const context = (projectId = "project", fileId = file) => ({ params: Promise.resolve({ projectId, fileId }) });
  const getConfig = (projectId) => configRoute.GET(new Request("http://localhost:3000/editor"), context(projectId));
  const content = url => contentRoute.GET(new Request(url), context());
  const stored = async () => (await client.execute({ sql: "SELECT * FROM project_files WHERE id=?", args: [file] })).rows[0];
  delete process.env.ONLYOFFICE_DOCUMENT_SERVER_URL;
  delete process.env.ONLYOFFICE_JWT_SECRET;
  assert.equal((await getConfig()).status, 503);
  process.env.ONLYOFFICE_DOCUMENT_SERVER_URL = "http://localhost:8080";
  process.env.ONLYOFFICE_JWT_SECRET = "my_custom_secret_key_1234";
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  const originalFetch = globalThis.fetch;
  let fetches = 0, failFetch = false, oversize = false;
  let savedBytes = "force saved bytes";
  globalThis.fetch = async (url, options) => {
    fetches++;
    assert.equal(new URL(url).origin, "http://localhost:8080");
    assert.equal(options.redirect, "error");
    return failFetch ? new Response("failed", { status: 500 }) : new Response(savedBytes, { headers: oversize ? { "Content-Length": String(20 * 1024 * 1024 + 1) } : {} });
  };
  try {
    setToken(""); assert.equal((await getConfig()).status, 401);
    setToken("outsider-token"); assert.equal((await getConfig()).status, 404);
    setToken("reader-token");
    const reader = await (await getConfig()).json();
    assert.equal(reader.canEdit, false);
    assert.equal(reader.config.editorConfig.mode, "view");
    assert.equal(reader.config.document.permissions.edit, false);
    assert.equal(reader.config.editorConfig.callbackUrl, undefined);
    setToken("owner-token");
    assert.equal((await getConfig("second")).status, 404);
    const response = await getConfig(); assert.equal(response.status, 200);
    const editor = await response.json();
    assert.equal(editor.canEdit, true);
    assert.equal(editor.config.documentType, "word");
    assert.equal(editor.config.editorConfig.customization.forcesave, true);
    const signed = lib.verifyOnlyofficeJwt(editor.config.token, secret);
    assert.equal(signed.document.key, editor.config.document.key);
    assert.throws(() => lib.verifyOnlyofficeJwt(`${editor.config.token}x`, secret));
    assert.throws(() => lib.verifyOnlyofficeJwt(lib.signOnlyofficeJwt({ exp: 1 }, secret), secret));
    const source = editor.config.document.url;
    setToken(""); // The document server has no browser cookie.
    assert.equal(await (await content(source)).text(), "document bytes");
    assert.equal((await content(`${source}x`)).status, 403);
    const swapped = new URL(source); swapped.searchParams.set("token", new URL(editor.config.editorConfig.callbackUrl).searchParams.get("token"));
    assert.equal((await content(swapped)).status, 403);
    const key = editor.config.document.key;
    const callback = (payload, options = {}) => {
      const token = lib.signOnlyofficeJwt(options.header ? { payload, operation: "callback" } : payload, secret);
      return callbackRoute.POST(new Request(options.url || editor.config.editorConfig.callbackUrl, {
        method: "POST", headers: { "Content-Type": "application/json", ...(options.header ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(options.header ? payload : { ...payload, ...options.unsigned, token }),
      }), context(options.projectId));
    };
    const payload = { key, status: 6, filetype: "docx", url: "https://office.example/cache/edited.docx" };
    const before = await stored(), count = objects.size;
    assert.equal((await callback({ ...payload, key: "another-file" })).status, 403);
    assert.equal((await callback(payload, { projectId: "second" })).status, 403);
    assert.equal((await callback(payload, { url: source })).status, 403);
    assert.equal((await callback({ ...payload, url: "http://127.0.0.1/private" })).status, 403);
    assert.equal((await callback({ ...payload, status: 7 })).status, 502);
    failFetch = true; assert.equal((await callback(payload)).status, 502); failFetch = false;
    oversize = true; assert.equal((await callback(payload)).status, 413); oversize = false;
    setFailStorage(true); assert.equal((await callback(payload)).status, 500); setFailStorage(false);
    assert.equal((await stored()).object_key, before.object_key);
    assert.equal(objects.size, count);
    await client.execute("DELETE FROM project_members WHERE project_id='project' AND user_id='owner'");
    assert.equal((await callback(payload)).status, 404);
    await client.execute("INSERT INTO project_members(project_id,workspace_id,user_id) VALUES ('project','ws','owner')");
    assert.deepEqual(await (await callback(payload, { unsigned: { url: "https://evil.example/bad", status: 2 } })).json(), { error: 0 });
    assert.equal(objects.size, count);
    assert.equal(objects.get((await stored()).object_key).toString(), savedBytes);
    setToken("owner-token");
    assert.equal((await (await getConfig()).json()).config.document.key, key, "force save retains the co-editing key");
    savedBytes = "document bytes";
    assert.deepEqual(await (await callback({ ...payload, status: 2 }, { header: true })).json(), { error: 0 });
    const finished = await stored();
    assert.equal(Number(finished.editor_version), Number(before.editor_version) + 1);
    assert.ok(finished.updated_at);
    assert.equal(objects.get(finished.object_key).toString(), "document bytes");
    assert.equal(objects.size, count);
    assert.equal((await content(source)).status, 409);
    const previousFetches = fetches;
    assert.equal((await callback({ ...payload, status: 2 })).status, 200);
    assert.equal((await callback(payload)).status, 200);
    assert.equal(fetches, previousFetches, "duplicate and late callbacks cannot overwrite a completed version");
    const next = await (await getConfig()).json();
    assert.notEqual(next.config.document.key, key);
    const closeToken = lib.signOnlyofficeJwt({ key: next.config.document.key, status: 4 }, secret);
    assert.equal((await callbackRoute.POST(new Request(next.config.editorConfig.callbackUrl, { method: "POST", body: JSON.stringify({ token: closeToken }) }), context())).status, 200);
    await client.execute({ sql: "UPDATE project_files SET name='unsupported.zip' WHERE id=?", args: [file] });
    assert.equal((await getConfig()).status, 415);
    await client.execute({ sql: "UPDATE project_files SET name=? WHERE id=?", args: [before.name, file] });
    console.log("PASS ONLYOFFICE: signed config/source/callback, viewer permissions, save/force-save, version rotation, stale callbacks, storage failures and URL validation");
  } finally {
    globalThis.fetch = originalFetch;
    setToken("owner-token"); setFailStorage(false);
  }
}
