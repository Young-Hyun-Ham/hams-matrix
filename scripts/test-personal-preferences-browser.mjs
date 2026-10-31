// Real settings UI, synthetic users/SQLite, separate Chrome profile. No member DB or paid calls.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
const folder = await mkdtemp(join(tmpdir(), "matrix-personal-browser-"));
const url = pathToFileURL(join(folder, "test.db")).href, origin = "http://localhost:3271";
const db = createClient({ url });
let server, browser, socket, sessionId, serial = 0, logs = "";
const pending = new Map();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(test, label) {
  for (let index = 0; index < 150; index++) { try { const result = await test(); if (result) return result; } catch {} await pause(100); }
  throw new Error(`Timed out: ${label}`);
}
function call(method, params = {}, attached = true) {
  return new Promise((resolve, reject) => { const id = ++serial; const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, ...(attached && sessionId ? { sessionId } : {}) })); });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(150); }
async function input(selector, value, select = false) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${select ? "HTMLSelectElement" : "HTMLInputElement"}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${select ? "change" : "input"}',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pause(150);
}
async function navigate(user) {
  await call("Network.setCookie", { name: "hams_session", value: `${user}-token`, url: origin, httpOnly: true });
  await call("Page.navigate", { url: `${origin}/settings?tab=interface` });
  await waitFor(() => evaluate("!!document.querySelector('.personal-interface-form') && !document.querySelector('.theme-toggle').disabled"), `settings ${user}`);
}
async function prefs(user = "A") {
  return (await fetch(`${origin}/api/me/preferences`, { headers: { cookie: `hams_session=${user}-token` } })).json();
}
async function save(user = "A") {
  const version = (await prefs(user)).version;
  await click('.personal-settings-actions button[type="submit"]');
  await waitFor(async () => (await prefs(user)).version > version, "settings save");
  await waitFor(() => evaluate("!document.querySelector('.personal-settings-actions button[type=button]').disabled"), "save rendered");
}
async function screenshot(name) {
  const result = await call("Page.captureScreenshot", { format: "png" }); await writeFile(join(folder, `${name}.png`), Buffer.from(result.data, "base64"));
}
function stop(child) { if (!child?.pid) return; if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else child.kill(); }
try {
  for (const name of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await db.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  await db.executeMultiple("INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('A','Synthetic A','user',1),('B','Synthetic B','user',1); INSERT INTO workspaces(id,name) VALUES ('ws','Synthetic workspace'); INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','A','owner'),('ws','B','member');");
  for (const user of ["A", "B"]) await db.execute({ sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)", args: [user, createHash("sha256").update(`${user}-token`).digest("hex"), user, "ws", new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()] });
  server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3271"], { windowsHide: true, env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "", APP_URL: origin, OPENAI_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { logs += data; }); server.stderr.on("data", (data) => { logs += data; });
  await waitFor(async () => (await fetch(`${origin}/login`)).ok, "Next server");
  browser = spawn(process.env.MATRIX_TEST_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${join(folder, "profile")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  const port = await waitFor(async () => (await readFile(join(folder, "profile", "DevToolsActivePort"), "utf8")).split("\n"), "Chrome");
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = (event) => { const message = JSON.parse(event.data), item = pending.get(message.id); if (item) { pending.delete(message.id); if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result); } };
  const { targetId } = await call("Target.createTarget", { url: "about:blank" }, false);
  ({ sessionId } = await call("Target.attachToTarget", { targetId, flatten: true }, false));
  await call("Network.enable"); await call("Page.enable"); await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate("A");
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#6d51e8");
  await input('input[aria-label="강조 색상 HEX 코드"]', "#0055cc");
  await waitFor(() => evaluate("document.documentElement.dataset.customAccent==='true'"), "accent preview");
  await click('.interface-subtabs button:nth-child(2)');
  await input('[role=tabpanel]:not([hidden]) select', "top", true);
  await click('.interface-subtabs button:first-child');
  assert.equal(await evaluate("document.querySelector('input[aria-label=\"강조 색상 HEX 코드\"]').value"), "#0055cc");
  await click('.personal-settings-actions button[type=button]');
  assert.equal(await evaluate("document.documentElement.dataset.customAccent"), undefined);
  assert.equal((await prefs()).accentColor, null);
  await input('input[aria-label="강조 색상 HEX 코드"]', "#22aa66"); await save();
  assert.equal((await prefs()).accentColor, "#22aa66");
  await click('.interface-subtabs button:nth-child(2)');
  await input('[role=tabpanel]:not([hidden]) select', "top", true);
  await input('[role=tabpanel]:not([hidden]) input[type=color]', "#112233");
  await input('input[aria-label="토스트 폰트 색상"]', "#ffffff");
  await input('input[aria-label="토스트 닫기 버튼 색상"]', "#ffcc00");
  await input('input[aria-label="토스트 닫기 버튼 바탕색"]', "#334455");
  await evaluate("[...document.querySelectorAll('[role=tabpanel]:not([hidden]) button')].find(button=>button.textContent==='토스트 미리보기').click()");
  await waitFor(() => evaluate("(()=>{const button=document.querySelector('button[aria-label=\"알림 닫기\"]');return button && getComputedStyle(button).color==='rgb(255, 204, 0)' && getComputedStyle(button).backgroundColor==='rgb(51, 68, 85)'})()"), "toast close colors preview");
  await save();
  assert.equal((await prefs()).toastCloseButtonColor, "#ffcc00"); assert.equal((await prefs()).toastCloseButtonBackgroundColor, "#334455");
  await click('button[aria-label="알림 닫기"]');
  assert.equal((await prefs()).toastBackgroundColor, "#112233"); assert.equal((await prefs()).accentColor, "#22aa66");
  await click('.theme-toggle');
  await waitFor(() => evaluate("document.documentElement.dataset.theme==='dark'"), "dark toggle");
  await click('.interface-subtabs button:first-child');
  assert.equal(await evaluate("document.querySelector('[role=tabpanel]:not([hidden]) select').value"), "dark");
  await screenshot("personal-dark");
  await input('input[aria-label="강조 색상 HEX 코드"]', "#ff5500");
  await click('.theme-toggle');
  await waitFor(() => evaluate("document.documentElement.dataset.theme==='light'"), "light toggle with draft");
  assert.equal(await evaluate("document.querySelector('input[aria-label=\"강조 색상 HEX 코드\"]').value"), "#ff5500");
  assert.equal((await prefs()).accentColor, "#22aa66");
  await click('.personal-settings-actions button[type=button]');
  await navigate("A");
  assert.equal((await prefs()).accentColor, "#22aa66");
  const aPrimary = await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()");
  await navigate("B");
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#6d51e8");
  await input('input[aria-label="강조 색상 HEX 코드"]', "#884400"); await save("B");
  assert.equal((await prefs("B")).accentColor, "#884400"); assert.equal((await prefs("A")).accentColor, "#22aa66");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(250);
  if (await evaluate("document.querySelector('[aria-controls=workspace-navigation]').getAttribute('aria-expanded')==='true'")) await click('[aria-controls=workspace-navigation]');
  await pause(250);
  assert.ok(await evaluate("document.querySelector('.personal-interface-form').getBoundingClientRect().right <= innerWidth"));
  await screenshot("personal-mobile");
  await navigate("A"); assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), aPrimary);
  await evaluate("document.querySelector('.interface-subtabs button').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('.interface-subtabs button[aria-selected=true]').textContent"), "토스트");
  await click('[aria-label="로그아웃"]');
  await waitFor(() => evaluate("location.pathname==='/login' && document.documentElement.dataset.personalTheme===undefined"), "logout clears personal palette");
  assert.equal(await evaluate("getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"), "#6d51e8");
  console.log(`PASS: real browser personal tabs/draft/cancel/save, toast preservation, header toggle merge, reload, A/B isolation, keyboard tabs, mobile layout and logout palette cleanup. Evidence: ${folder}`);
} catch (error) { if (socket?.readyState === 1) await screenshot("failure").catch(() => {}); console.error(logs.slice(-1500)); console.error(`Evidence: ${folder}`); throw error; }
finally { socket?.close(); stop(browser); stop(server); db.close(); }
