// Real workspace UI against synthetic SQLite and a private Chrome profile.
// Logout failures are intercepted in the page; success/401 use synthetic sessions.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { checkAiTargetBrowser } from "./check-ai-target-browser.mjs";
import { checkDatabaseDomainsBrowser } from "./check-database-domains-browser.mjs";

const folder = await mkdtemp(join(tmpdir(), "matrix-navigation-browser-"));
const db = createClient({ url: pathToFileURL(join(folder, "test.db")).href });
const origin = "http://localhost:3278";
const targetMode = process.argv.includes("--targets-only");
const databaseMode = process.argv.includes("--database-only");
const mockAi = targetMode || databaseMode;
const toggle = '[aria-controls="workspace-navigation"]';
const ai = '[aria-controls="matrix-ai-conversations"]';
const dashboard = '.sidebar .nav-item[href="/dashboard"]';
let server, browser, socket, sessionId, serial = 0, logs = "";
const pending = new Map();
const errors = [];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitFor(test, label) {
  for (let index = 0; index < 200; index++) {
    try { const result = await test(); if (result) return result; } catch { /* Startup/navigation. */ }
    await pause(100);
  }
  throw new Error(`Timed out: ${label}`);
}
function call(method, params = {}, attached = true) {
  return new Promise((resolveCall, reject) => {
    const id = ++serial;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 25000);
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolveCall(value); }, reject });
    socket.send(JSON.stringify({ id, method, params, ...(attached && sessionId ? { sessionId } : {}) }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await pause(300);
}
async function resize(width, height = 1000) {
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await pause(350);
}
async function navigate(user = "nav-user", path = "/dashboard") {
  await call("Network.setCookie", { name: "hams_session", value: `${user}-session`, url: origin, httpOnly: true });
  await call("Page.navigate", { url: origin + path });
  await waitFor(() => evaluate("!!document.querySelector('.sidebar-user') && !document.querySelector('.theme-toggle').disabled"), `hydration: ${user}`);
  await pause(350);
}
async function collapse() {
  if (await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-expanded')==='true'`)) await click(toggle);
}
async function expand() {
  if (await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-expanded')==='false'`)) await click(toggle);
}
async function hover(selector) {
  const rect = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await pause(100);
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: rect.x, y: rect.y });
  await pause(380);
}
async function clearPointer() {
  await evaluate("document.activeElement?.blur()");
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 600, y: 100 });
  await pause(180);
}
async function screenshot(name) {
  const result = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(join(folder, `${name}.png`), Buffer.from(result.data, "base64"));
}
function stop(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill();
}

try {
  for (const name of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort())
    await db.executeMultiple((await readFile(join("db/migrations", name), "utf8")).replace(/^\uFEFF/, ""));
  await db.executeMultiple(`
    INSERT INTO users(id,name,account_role,onboarding_complete) VALUES
      ('nav-user','Navigation User','user',1),('nav-admin','Navigation Admin','admin',1);
    INSERT INTO workspaces(id,name) VALUES ('nav-ws','Synthetic navigation workspace');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES
      ('nav-ws','nav-user','owner'),('nav-ws','nav-admin','admin');
    UPDATE plans SET team_sharing_enabled=0 WHERE code='free';
    UPDATE plans SET team_sharing_enabled=1 WHERE code='team';
    UPDATE user_subscriptions SET plan_code='team' WHERE user_id='nav-admin';
  `);
  if (targetMode || databaseMode) await db.executeMultiple(`
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('nav-project','nav-ws','Target project','nav-admin','nav-admin'),('nav-free-project','nav-ws','Temporary target project','nav-user','nav-user');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('nav-project','nav-ws','nav-admin','admin'),('nav-free-project','nav-ws','nav-user','admin');
  `);
  for (const user of ["nav-user", "nav-admin"])
    await db.execute({ sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)", args: [user, createHash("sha256").update(`${user}-session`).digest("hex"), user, "nav-ws", new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()] });

  server = spawn(process.execPath, [...(mockAi ? ["--import",pathToFileURL(resolve("scripts/ai-test-provider.mjs")).href] : []),resolve("node_modules/next/dist/bin/next"), "start", "--port", "3278"], {
    windowsHide: true,
    env: { ...process.env, TURSO_DATABASE_URL: pathToFileURL(join(folder, "test.db")).href, TURSO_AUTH_TOKEN: "", APP_URL: origin, OPENAI_API_KEY: mockAi ? "synthetic-target-provider" : "", OPENAI_MODELS: mockAi ? "gpt-5.6-sol" : "", MATRIX_AI_TEST: mockAi ? "1" : "", AI_IMAGE_ENCRYPTION_KEY: mockAi ? Buffer.alloc(32,66).toString("base64") : "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (data) => { logs += data; });
  server.stderr.on("data", (data) => { logs += data; });
  await waitFor(async () => (await fetch(origin + "/login")).ok, "Next server");
  browser = spawn(process.env.MATRIX_TEST_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${join(folder, "profile")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  const port = await waitFor(async () => (await readFile(join(folder, "profile", "DevToolsActivePort"), "utf8")).split("\n"), "Chrome");
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject; });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data), item = pending.get(message.id);
    if (item) { pending.delete(message.id); if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result); }
    else if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  };
  const { targetId } = await call("Target.createTarget", { url: "about:blank" }, false);
  ({ sessionId } = await call("Target.attachToTarget", { targetId, flatten: true }, false));
  await call("Network.enable"); await call("Page.enable"); await call("Runtime.enable");
  if (databaseMode) {
    await checkDatabaseDomainsBrowser({evaluate,click,resize,pause,waitFor,screenshot,db,call,origin});
    assert.deepEqual(errors,[]);
    console.log(`PASS database browser. Evidence: ${folder}`);
  } else if (targetMode) {
    await checkAiTargetBrowser({evaluate,click,navigate,resize,pause,waitFor,screenshot,db,call});
    assert.deepEqual(errors,[]);
    console.log(`Evidence: ${folder}`);
  } else {
  await resize(1440);
  await navigate();
  assert.equal(await evaluate("!!document.querySelector('.sidebar a[href=\"/team\"]')"), false);
  assert.equal(await evaluate("!!document.querySelector('.sidebar a[href=\"/admin/settings\"]')"), false);

  for (const [width, expandedWidth] of [[1440,240],[1201,240],[1200,214],[1024,214],[961,214],[960,210],[800,210],[701,210]]) {
    await resize(width); await expand();
    assert.equal(await evaluate("document.querySelector('.sidebar').getBoundingClientRect().width"), expandedWidth, `expanded at ${width}`);
    await collapse();
    const metrics = await evaluate(`(()=>{const s=document.querySelector('.sidebar'),b=document.querySelector('.workspace-body'),l=document.querySelector('.sidebar-logout'),u=document.querySelector('.user-summary'),i=document.querySelector('.sidebar .nav-item'),r=s.getBoundingClientRect();return {width:r.width,left:r.left,bodyLeft:b.getBoundingClientRect().left,logoutWidth:l.getBoundingClientRect().width,logoutHeight:l.getBoundingClientRect().height,user:getComputedStyle(u).display,label:getComputedStyle(i.querySelector('.nav-label')).display,icon:i.querySelector('svg').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
    assert.deepEqual(metrics, { width:64,left:0,bodyLeft:64,logoutWidth:44,logoutHeight:44,user:"none",label:"none",icon:19,overflow:false }, `collapsed at ${width}`);
  }
  await resize(1440);
  await clearPointer(); await hover(dashboard);
  assert.equal(await evaluate("document.querySelector('[role=tooltip]')?.textContent"), "대시보드");
  assert.deepEqual(await evaluate(`(()=>{const t=document.querySelector('[role=tooltip]'),a=document.querySelector(${JSON.stringify(dashboard)});return {portal:t.parentElement===document.body,described:a.getAttribute('aria-describedby')===t.id,gap:Math.round(t.getBoundingClientRect().left-a.getBoundingClientRect().right)}})()`), {portal:true,described:true,gap:8});
  // Move across the gap into the portal: the tooltip must remain readable.
  const tip = await evaluate("(()=>{const r=document.querySelector('[role=tooltip]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await call("Input.dispatchMouseEvent", { type:"mouseMoved", ...tip }); await pause(350);
  assert.equal(await evaluate("!!document.querySelector('[role=tooltip]')"), true);
  await call("Input.dispatchKeyEvent", { type:"keyDown", key:"Escape", code:"Escape", windowsVirtualKeyCode:27 });
  await pause(380);
  assert.equal(await evaluate("!!document.querySelector('[role=tooltip]')"), false);
  await clearPointer();
  await evaluate(`document.querySelector(${JSON.stringify(dashboard)}).focus()`);
  await waitFor(() => evaluate("document.querySelector('[role=tooltip]')?.textContent==='대시보드'"), "keyboard tooltip");
  await click(toggle); await pause(350);
  assert.equal(await evaluate("!!document.querySelector('[role=tooltip]')"), false);
  await collapse(); await pause(350);
  assert.equal(await evaluate("!!document.querySelector('[role=tooltip]')"), false, "old tooltip does not return after state round trip");

  await click(ai);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-expanded')`), "true");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(ai)}).getAttribute('aria-expanded')`), "true");
  await click('.matrix-ai-project-toggle');
  await click('.matrix-ai-new-chat');
  await waitFor(() => evaluate("document.querySelector('.workspace-content-layout').classList.contains('ai-is-open')"), "select new synthetic conversation");
  await collapse();
  assert.equal(await evaluate("!!document.querySelector('#matrix-ai-conversations')"), false);
  assert.equal(await evaluate("document.querySelector('.workspace-content-layout').classList.contains('ai-is-open')"), true, "collapse preserves selected chat");
  await click('[aria-label="AI 채팅 닫기"]');
  await click(ai); await click('.matrix-ai-project-toggle');
  await evaluate(`window.navigationFetchBeforeCreate=window.fetch;window.fetch=(url,options)=>url==='/api/ai/conversations'&&options?.method==='POST'?new Promise(resolve=>{window.finishCreate=()=>resolve(Response.json({conversation:{convId:'temporary-navigation-delayed',projectId:'',title:'Delayed synthetic chat',isPinned:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}))}):window.navigationFetchBeforeCreate(url,options)`);
  await click('.matrix-ai-new-chat'); await collapse();
  await evaluate("window.finishCreate();window.fetch=window.navigationFetchBeforeCreate"); await pause(250);
  assert.equal(await evaluate("document.querySelector('.workspace-content-layout').classList.contains('ai-is-open')"), false, "unmounted list does not select delayed chat");
  await evaluate(`(()=>{const e=document.querySelector('.global-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'AI');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await waitFor(() => evaluate("!!document.querySelector('.search-results a')"), "AI search");
  await click('.search-results a');
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(toggle)}).getAttribute('aria-expanded')`), "true");
  assert.equal(await evaluate("document.body.style.overflow"), "");
  await collapse();
  // CSS geometry of a docked AI panel without making any paid/provider calls.
  await resize(800);
  await evaluate("document.querySelector('.workspace-content-layout').classList.add('ai-is-open')"); await pause(350);
  assert.equal(await evaluate("Math.round(document.querySelector('.matrix-ai-drawer').getBoundingClientRect().left)"),64);
  assert.equal(await evaluate("Math.round(document.querySelector('.matrix-ai-backdrop').getBoundingClientRect().left)"),64);
  await expand();
  assert.equal(await evaluate("Math.round(document.querySelector('.matrix-ai-drawer').getBoundingClientRect().left)"),210);
  await evaluate("document.querySelector('.workspace-content-layout').classList.remove('ai-is-open')");

  await resize(700);
  assert.equal(await evaluate("document.querySelector('.sidebar').inert"), true);
  await click(toggle);
  assert.equal(await evaluate("document.body.style.overflow"),"hidden");
  assert.equal(await evaluate("document.querySelector('.sidebar').getBoundingClientRect().width"),260);
  await resize(701);
  assert.equal(await evaluate("document.body.style.overflow"), "");
  assert.equal(await evaluate("!!document.querySelector('.sidebar-overlay')"), false);
  await resize(390,844); await pause(250);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.user-summary')).display==='none'"),false);
  await click('.sidebar-overlay');
  assert.equal(await evaluate("document.querySelector('.sidebar').inert"), true);
  assert.equal(await evaluate("document.body.style.overflow"), "");
  await screenshot("mobile-closed");

  await resize(1440); await collapse();
  await clearPointer(); await hover('.sidebar-logout');
  assert.equal(await evaluate("document.querySelector('[role=tooltip]')?.textContent"), "로그아웃");
  await screenshot("collapsed-tooltip");
  // Control logout responses and deferred completion without touching real users.
  await evaluate(`window.originalNavigationFetch=window.fetch;window.logoutCalls=0;window.fetch=(url,options)=>{if(url==='/api/auth/logout'){window.logoutCalls++;return Promise.resolve(new Response('{}',{status:500}))}return window.originalNavigationFetch(url,options)}`);
  await click('.sidebar-logout');
  await waitFor(() => evaluate("[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('로그아웃하지 못했습니다'))"), "collapsed logout toast");
  assert.equal(await evaluate("!!document.querySelector('.sidebar .error-message')"),false);
  await click('button[aria-label="알림 닫기"]');
  await expand(); await click('.sidebar-logout');
  assert.ok(await evaluate("document.querySelector('.sidebar .error-message')?.textContent.includes('로그아웃하지 못했습니다')"));
  await collapse();
  assert.equal(await evaluate("!!document.querySelector('.sidebar .error-message')"),false);
  await click('button[aria-label="알림 닫기"]');
  await expand();
  await evaluate(`window.fetch=(url,options)=>url==='/api/auth/logout'?(window.logoutCalls++,new Promise(resolve=>{window.finishLogout=()=>resolve(new Response('{}',{status:500}))})):window.originalNavigationFetch(url,options)`);
  await click('.sidebar-logout');
  assert.equal(await evaluate("document.querySelector('.sidebar-logout').disabled"),true);
  const count = await evaluate("window.logoutCalls");
  await click('.sidebar-logout'); assert.equal(await evaluate("window.logoutCalls"),count);
  await collapse(); await evaluate("window.finishLogout()"); await pause(250);
  assert.equal(await evaluate("!!document.querySelector('.sidebar .error-message')"),false);
  assert.equal(await evaluate("document.querySelector('.sidebar-logout').disabled"),false);
  await click('button[aria-label="알림 닫기"]');
  await evaluate(`window.fetch=(url,options)=>url==='/api/auth/logout'?Promise.reject(new Error('Synthetic offline')):window.originalNavigationFetch(url,options)`);
  await click('.sidebar-logout');
  assert.ok(await evaluate("[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Synthetic offline'))"));
  await evaluate("window.fetch=window.originalNavigationFetch");

  await navigate("nav-admin"); await collapse();
  assert.equal(await evaluate("!!document.querySelector('.sidebar a[href=\"/team\"]')"),true);
  assert.equal(await evaluate("!!document.querySelector('.sidebar a[href=\"/admin/settings\"]')"),true);
  await click(ai); await click('.matrix-ai-project-toggle'); await click('.matrix-ai-new-chat');
  await waitFor(() => evaluate("!!document.querySelector('[data-room-options]')"), "persisted synthetic conversation");
  await click('[aria-label="AI 채팅 닫기"]');
  await click('[data-room-options]'); await click('.matrix-ai-room-menu button:nth-child(2)');
  await waitFor(() => evaluate("!!document.querySelector('.matrix-ai-room-dialog[open]')"), "rename dialog");
  await click(toggle);
  assert.equal(await evaluate("!!document.querySelector('.matrix-ai-room-dialog[open]')"), false);
  assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(toggle)})`), true, "focus restored after dialog unmount");
  await resize(1440,480); await clearPointer(); await hover('.sidebar-logout');
  assert.ok(await evaluate("(()=>{const s=document.querySelector('.sidebar');return [...s.querySelectorAll('.nav-item,.sidebar-logout')].every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.left>=0&&r.right<=s.clientWidth})})()"), "scrollbar does not clip the 44px controls");
  assert.ok(await evaluate("(()=>{const r=document.querySelector('[role=tooltip]').getBoundingClientRect();return r.top>=8&&r.bottom<=innerHeight-8})()"));
  await evaluate("document.documentElement.dataset.theme='dark';document.documentElement.style.setProperty('--primary','#228866')");
  await screenshot("admin-dark-low-height");
  await clearPointer(); await click('.sidebar .secondary');
  assert.equal(await evaluate("!!document.querySelector('dialog[open]')"),true);
  assert.equal(await evaluate("!!document.querySelector('[role=tooltip]')"),false);
  await evaluate("document.querySelector('dialog[open] button').click()");
  await resize(1440);
  await click('.sidebar-logout');
  await waitFor(() => evaluate("location.pathname==='/login'"), "successful logout");
  // An already expired synthetic session returns 401 and also exits to login.
  await navigate();
  await db.execute("UPDATE sessions SET revoked_at='2026-01-01' WHERE id='nav-user'");
  await collapse(); await click('.sidebar-logout');
  await waitFor(() => evaluate("location.pathname==='/login'"), "401 logout");
  assert.deepEqual(errors,[]);
  console.log(`PASS: navigation geometry/breakpoints, mobile/inert/scroll lock, permissions, AI expansion/search/offset, portal hover/focus/Escape/reset, logout success/401/failure/in-flight state and dark/low-height. Evidence: ${folder}`);
  }
} catch (error) {
  if (socket?.readyState === 1) await screenshot("failure").catch(() => {});
  console.error(logs.slice(-1500));
  console.error(`Evidence: ${folder}`);
  throw error;
} finally {
  socket?.close(); stop(browser); stop(server); db.close();
}
