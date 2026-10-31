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


const folder = await mkdtemp(join(tmpdir(), "matrix-personal-preferences-"));
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
try {
  for (const name of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort())
    await client.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  await client.executeMultiple(`
    INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('owner','Owner','user',1),('reader','Reader','user',1);
    INSERT INTO workspaces(id,name) VALUES ('ws','Workspace');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','reader','viewer');
  `);
  for (const id of ["owner", "reader"]) await client.execute({ sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
    args: [id, createHash("sha256").update(`${id}-token`).digest("hex"), id, "ws", new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()] });
  const api = load(resolve("app/api/me/preferences/route.ts"));
  const patch = (data) => api.PATCH(new Request("http://localhost:3000/api/me/preferences", { method: "PATCH", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(data) }));
  assert.equal((await (await api.GET()).json()).accentColor, null);
  let response = await patch({ version: 0, accentColor: "#0055CC", defaultTheme: "dark", toastPosition: "top", toastBackgroundColor: "#223344", toastFontColor: "#ddeeff", toastCloseButtonColor: "#FFFFFF", toastCloseButtonBackgroundColor: "#0055CC" });
  assert.equal(response.status, 200);
  let prefs = await response.json();
  assert.equal(prefs.accentColor, "#0055cc");
  response = await patch({ version: prefs.version, toastPosition: "bottom" }); prefs = await response.json();
  assert.equal(prefs.accentColor, "#0055cc"); assert.equal(prefs.toastFontColor, "#ddeeff");
  response = await patch({ version: prefs.version, defaultTheme: "light" }); prefs = await response.json();
  assert.equal(prefs.accentColor, "#0055cc"); assert.equal(prefs.toastBackgroundColor, "#223344");
  assert.equal(prefs.toastCloseButtonColor, "#ffffff"); assert.equal(prefs.toastCloseButtonBackgroundColor, "#0055cc");
  for (const key of ["toastCloseButtonColor", "toastCloseButtonBackgroundColor"]) {
    for (const invalid of ["red", "#123", 123, {}, "url(evil)"]) assert.equal((await patch({ version: prefs.version, [key]: invalid })).status, 400);
  }
  assert.equal((await patch({ version: 0, accentColor: null })).status, 409);
  for (const value of ["red", "#123", "var(--primary)", "#12zz00", {}, 123, "#112233;display:none"]) assert.equal((await patch({ version: prefs.version, accentColor: value })).status, 400);
  assert.equal((await patch({ version: prefs.version, userId: "reader", accentColor: "#ffffff" })).status, 400);
  token = "reader-token";
  const otherDefaults = await (await api.GET()).json();
  assert.equal(otherDefaults.accentColor, null);
  assert.equal(otherDefaults.toastCloseButtonColor, null); assert.equal(otherDefaults.toastCloseButtonBackgroundColor, null);
  response = await patch({ version: 0, accentColor: "#22aa66" }); assert.equal(response.status, 200);
  token = "owner-token";
  assert.equal((await (await api.GET()).json()).accentColor, "#0055cc");
  response = await patch({ version: prefs.version, accentColor: null });
  const restored = await response.json();
  assert.equal(restored.accentColor, null);
  response = await patch({ version: restored.version, toastCloseButtonColor: null, toastCloseButtonBackgroundColor: null });
  const closeRestored = await response.json();
  assert.equal(closeRestored.toastCloseButtonColor, null); assert.equal(closeRestored.toastCloseButtonBackgroundColor, null);
  assert.equal(closeRestored.toastBackgroundColor, "#223344");
  token = ""; assert.equal((await api.GET()).status, 401); token = "owner-token";
  await client.execute("UPDATE users SET account_role='guest' WHERE id='reader'"); token = "reader-token";
  assert.equal((await api.GET()).status, 403); assert.equal((await patch({ version: 1, accentColor: null })).status, 403); token = "owner-token";
  await assert.rejects(client.execute("UPDATE user_preferences SET accent_color='bad' WHERE user_id='owner'"));

  const palette = load(resolve("lib/personal-palette.ts"));
  assert.equal(palette.personalPalette("light", null).primary, "#6d51e8");
  assert.equal(palette.personalPalette("dark", null).soft, "#302744");
  const { architectureTheme } = load(resolve("components/pages/architecture/architecture-theme.ts"));
  const customDiagram = architectureTheme("dark", "#0055cc");
  assert.equal(customDiagram.background, architectureTheme("dark", null).background);
  assert.equal(customDiagram.infrastructure, palette.personalPalette("dark", "#0055cc").soft);
  assert.equal(customDiagram.line, palette.personalPalette("dark", "#0055cc").primary);
  for (const theme of ["light", "dark"]) for (const color of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0055cc"]) {
    const colors = palette.personalPalette(theme, color);
    assert.ok(palette.contrastRatio(colors.primary, theme === "dark" ? "#22222e" : "#ffffff") >= 4.5);
    assert.ok(palette.contrastRatio(colors.primary, colors.onPrimary) >= 4.5);
  }
  // Real Zustand actions with controlled response timing reproduce account races.
  const properties = new Map(), storage = new Map();
  globalThis.document = { documentElement: { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value), removeProperty: (key) => properties.delete(key) } } };
  globalThis.localStorage = { setItem: (key, value) => storage.set(key, value) };
  const { usePreferences, defaults } = load(resolve("stores/preferences.ts"));
  const store = usePreferences.getState;
  const a = Symbol("A"), b = Symbol("B"), c = Symbol("C");
  store().initialize("A", { ...defaults, accentColor: "#0055cc" }, a);
  store().preview({ ...store().saved, accentColor: "#22aa66", toastPosition: "top" }, "A");
  globalThis.fetch = async () => Response.json({ ...defaults, accentColor: "#0055cc", defaultTheme: "dark", version: 1 });
  await store().save({ version: 0, defaultTheme: "dark" });
  assert.equal(store().current.accentColor, "#22aa66"); assert.equal(store().current.toastPosition, "top"); assert.equal(store().current.defaultTheme, "dark");
  let resolveA, resolveB;
  globalThis.fetch = () => new Promise((resolve) => { resolveA = resolve; });
  const pendingA = store().save({ version: 1, accentColor: "#ff0000" });
  store().initialize("B", defaults, b);
  globalThis.fetch = () => new Promise((resolve) => { resolveB = resolve; });
  const pendingB = store().save({ version: 0, accentColor: "#00bb77" });
  const bColor = properties.get("--primary");
  resolveA(Response.json({ ...defaults, accentColor: "#ff0000", version: 2 }));
  assert.equal(await pendingA, null); assert.equal(store().userId, "B"); assert.equal(store().busy, true); assert.equal(properties.get("--primary"), bColor);
  resolveB(Response.json({ ...defaults, accentColor: "#00bb77", version: 1 })); await pendingB;
  assert.equal(store().saved.accentColor, "#00bb77"); assert.equal(JSON.parse(storage.get("matrix-preferences:B")).accentColor, "#00bb77");
  assert.equal(store().reset("A", a), false);
  let rejectOld;
  globalThis.fetch = () => new Promise((_, reject) => { rejectOld = reject; });
  const oldFailure = store().save({ version: 1, defaultTheme: "dark" });
  store().initialize("C", { ...defaults, accentColor: "#884400" }, c);
  const cColor = properties.get("--primary"); rejectOld(new Error("late failure"));
  assert.equal(await oldFailure, null); assert.equal(properties.get("--primary"), cColor); assert.equal(store().userId, "C");
  assert.equal(store().reset("C", b), false); assert.equal(store().reset("C", c), true);
  assert.equal(properties.size, 0); assert.equal(document.documentElement.dataset.personalTheme, undefined);
  console.log("PASS: personal preference API isolation/defaults/partial PATCH/null reset/version/HEX constraints, accessible light/dark palettes, preview merge, stale account success/failure protection, user-bound cache and owner cleanup");
} finally {
  globalThis.fetch = originalFetch;
  client.close(); cache.get(resolve("lib/db.ts"))?.exports.db().close();
}

