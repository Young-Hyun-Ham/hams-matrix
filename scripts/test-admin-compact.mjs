// Headless Chromium/Edge UI regression against an isolated SQLite DB; no external AI calls.
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdtemp, readdir, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { bootstrapMaster } from "./lib/bootstrap-master.mjs";

const folder = await mkdtemp(join(tmpdir(), "matrix-admin-compact-"));
const origin = "http://localhost:3248", debug = "http://127.0.0.1:9348";
const client = createClient({ url: pathToFileURL(join(folder, "test.db")).href, timeout: 5000 });
let server, browser, socket, logs = "", sequence = 0;
const pending = new Map();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, description) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try { const result = await fn(); if (result) return result; } catch { /* Server/navigation may still be starting. */ }
    await pause(150);
  }
  throw new Error(`Timed out: ${description}`);
}
function cdp(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(path, ready) {
  await cdp("Page.navigate", { url: origin + path });
  await waitFor(() => evaluate(`location.pathname+location.search===${JSON.stringify(path)} && !!document.querySelector(${JSON.stringify(ready)})?.getBoundingClientRect().width`), path);
}
async function click(selector, ready) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();e.click();})()`);
  await waitFor(() => evaluate(`!!document.querySelector(${JSON.stringify(ready)})?.getBoundingClientRect().width`), ready);
}
async function resize(width) {
  await cdp("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
}
async function screenshot(name) {
  const result = await cdp("Page.captureScreenshot", { format: "png" });
  await writeFile(join(folder, name + ".png"), Buffer.from(result.data, "base64"));
}
async function modalMetrics() {
  return evaluate(`(()=>{const d=document.querySelector('dialog[open]'),h=d.querySelector('.admin-detail-header'),b=d.querySelector('.admin-detail-body'),c=h.querySelector('button');return {header:h.getBoundingClientRect().height,closeWidth:c.getBoundingClientRect().width,padding:getComputedStyle(d).padding,bodyTop:getComputedStyle(b).paddingTop,shadow:getComputedStyle(h).boxShadow,font:getComputedStyle(h.querySelector('h2')).fontSize,bodyOverflow:getComputedStyle(b).overflowY,maxHeight:d.getBoundingClientRect().height<=innerHeight*.85+1};})()`);
}
async function assertModal() {
  const metrics = await modalMetrics();
  assert.equal(metrics.padding, "0px"); assert.equal(metrics.font, "12px");
  assert.equal(metrics.bodyTop, "16px"); assert.notEqual(metrics.shadow, "none");
  assert.equal(metrics.bodyOverflow, "auto"); assert.ok(metrics.maxHeight);
  assert.ok(metrics.header <= 44 && metrics.header >= 34, JSON.stringify(metrics));
  assert.ok(metrics.closeWidth < 80);
  return metrics;
}
function stop(process) {
  if (!process?.pid) return;
  if (globalThis.process.platform === "win32") spawnSync("taskkill", ["/pid", String(process.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else process.kill("SIGTERM");
}
try {
  for (const name of (await readdir("db/migrations")).filter(name => name.endsWith(".sql")).sort())
    await client.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  const password = randomUUID() + "Aa1!";
  await bootstrapMaster(client, password);
  await client.execute({ sql: "INSERT INTO users(id,name,job_title,account_role) VALUES ('compact-member','Compact Fixture',?,'user')", args: ["검증용 긴 직무 ".repeat(7)] });
  await client.execute({ sql: "INSERT INTO audit_logs(id,occurred_at,request_id,actor_name,actor_type,action,resource_type,outcome,source,http_method,route,before_json,after_json) VALUES ('compact-history',?,'fixture-request','Test actor','system','UPDATE','fixture','success','system','PATCH','/fixture',?,?)", args: [new Date().toISOString(), JSON.stringify({ name: "Before " + "Long fixture text ".repeat(90) }), JSON.stringify({ name: "After" })] });
  server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3248"], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TURSO_DATABASE_URL: pathToFileURL(join(folder, "test.db")).href, TURSO_AUTH_TOKEN: "", APP_URL: origin, OPENAI_API_KEY: "", OPENAI_MODELS: "", NEXT_TELEMETRY_DISABLED: "1" },
  });
  server.stdout.on("data", data => logs += data); server.stderr.on("data", data => logs += data);
  await waitFor(async () => (await fetch(origin + "/login")).ok, "Next server");
  const login = await fetch(origin + "/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "master@hamsfam.co.kr", password }) });
  assert.equal(login.status, 200);
  const cookies = login.headers.getSetCookie();
  let executable = process.env.MATRIX_TEST_BROWSER;
  if (!executable) for (const candidate of ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"]) {
    try { await access(candidate); executable = candidate; break; } catch { /* Try the next installed browser. */ }
  }
  if (!executable) throw new Error("Set MATRIX_TEST_BROWSER to a Chromium/Edge executable.");
  browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=9348", `--user-data-dir=${join(folder, "browser")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  await waitFor(async () => (await fetch(debug + "/json/version")).ok, "isolated headless browser");
  const target = await (await fetch(debug + "/json/new?about:blank", { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const result = JSON.parse(String(data)), entry = pending.get(result.id);
    if (!entry) return; pending.delete(result.id);
    if (result.error) entry.reject(new Error(result.error.message)); else entry.resolve(result.result);
  });
  await cdp("Page.enable"); await cdp("Network.enable");
  for (const cookie of cookies) {
    const part = cookie.split(";")[0], at = part.indexOf("=");
    await cdp("Network.setCookie", { name: part.slice(0, at), value: part.slice(at + 1), url: origin, httpOnly: true });
  }
  await resize(1440);
  await navigate("/admin/settings?tab=guardrails", ".guardrail-toggle");
  assert.equal(await evaluate("document.querySelector('.breadcrumb strong').textContent.trim()"), "AI 가드레일 관리");
  assert.equal(await evaluate("document.querySelector('.admin-settings-page > h1').getBoundingClientRect().height"), 1);
  for (const width of [1440, 1024, 768, 390]) {
    await resize(width);
    const metrics = await evaluate(`(()=>{const label=document.querySelector('.guardrail-toggle'),i=label.querySelector('input'),t=label.querySelector('strong'),grid=document.querySelector('.guardrail-grid');return {display:getComputedStyle(label).display,left:i.getBoundingClientRect().right<t.getBoundingClientRect().left,aligned:Math.abs(i.getBoundingClientRect().top-t.getBoundingClientRect().top)<5,columns:new Set(Array.from(grid.querySelectorAll(':scope > label')).map(e=>Math.round(e.getBoundingClientRect().left))).size,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
    assert.equal(metrics.display, "flex"); assert.ok(metrics.left && metrics.aligned, JSON.stringify({ width, ...metrics }));
    assert.equal(metrics.columns, width <= 760 ? 1 : 2); assert.equal(metrics.overflow, false);
    const fonts = await evaluate(`Array.from(document.querySelectorAll('.admin-settings-content :is(h2,h3,p,span,strong,small,legend,label,input,select,textarea,button,table,th,td,pre,a,li)')).filter(e=>e.getClientRects().length).map(e=>getComputedStyle(e).fontSize)`);
    assert.ok(fonts.every(size => size === "12px"), JSON.stringify([...new Set(fonts)]));
  }
  await screenshot("guardrails-mobile");
  await resize(1440);
  // Client-side transitions also load personal-settings CSS; administration must remain isolated.
  await click(".user-summary", ".settings-form");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.settings-form .button')).minHeight"), "42px");
  await click('.sidebar a[href="/admin/settings"]', ".plan-admin input");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.plan-admin .button')).minHeight"), "26px");
  const checks = await evaluate(`Array.from(document.querySelectorAll('.plan-admin label.check')).map(e=>({display:getComputedStyle(e).display,left:e.querySelector('input').getBoundingClientRect().left,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))`);
  assert.ok(checks.every(e=>e.left<e.right && e.display==='flex'),JSON.stringify(checks));
  await click('.admin-settings-tab[href$="tab=members"]', ".admin-list-table tbody tr");
  await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('.admin-list-table tbody tr')).find(r=>r.textContent.includes('Compact Fixture')).querySelector('button');b.focus();b.click();})()`);
  await waitFor(() => evaluate("!!document.querySelector('dialog[open] .admin-member-form')"), "member detail");
  const member = await assertModal();
  await evaluate("document.querySelector('.admin-detail-close').blur()");
  await screenshot("member-detail-light");
  await evaluate("document.documentElement.dataset.theme='dark'");
  await screenshot("member-detail-dark");
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor(() => evaluate("!document.querySelector('dialog[open]')"), "Escape close");
  assert.equal(await evaluate("document.activeElement.textContent.trim()"), "상세 보기");
  await click('.admin-settings-tab[href$="tab=history"]', ".admin-logging-settings + section .admin-list-table tbody tr");
  await click(".admin-list-table tbody tr button", "dialog[open] .admin-history-json");
  const history = await assertModal();
  assert.equal(history.header, member.header);
  assert.ok(await evaluate("document.querySelector('.admin-detail-body').scrollHeight>document.querySelector('.admin-detail-body').clientHeight"));
  await evaluate("document.querySelector('.admin-detail-close').blur()");
  await screenshot("history-detail-dark");
  await resize(390); await assertModal(); await screenshot("history-detail-mobile");
  await evaluate("document.querySelector('.admin-detail-body').scrollTop=200");
  assert.ok(await evaluate("document.querySelector('.admin-detail-header').getBoundingClientRect().top>=0"));
  await evaluate("document.querySelector('.admin-detail-close').click()");
  // Selected overflowing tab is scrolled into view on direct entry and browser history.
  const tabVisible = await evaluate(`(()=>{const n=document.querySelector('.admin-settings-tabs').getBoundingClientRect(),a=document.querySelector('.admin-settings-tab[aria-current=page]').getBoundingClientRect();return a.left>=n.left-1&&a.right<=n.right+1;})()`);
  assert.ok(tabVisible);
  await cdp("Page.navigate", { url: origin + "/admin/settings?tab=guardrails" });
  await waitFor(() => evaluate("!!document.querySelector('.guardrail-toggle')"), "guardrails again");
  await evaluate("history.back()");
  await waitFor(() => evaluate("location.search==='?tab=history' && !!document.querySelector('.admin-list-table')"), "browser back");
  console.log("PASS: headless browser at 1440/1024/768/390px; 12px text; two/one-column leading checkboxes; compact buttons and tabs; isolated personal settings; matching member/history headers, shadows, body scroll, Escape/focus return and browser back.");
  console.log("Screenshots (synthetic fixtures only): " + folder);
} catch (error) {
  if(socket?.readyState===1){try{await screenshot("failure");console.error("Browser evidence: "+folder);}catch{ /* Preserve original failure. */ }}
  console.error(logs.slice(-2000)); throw error;
} finally {
  socket?.close(); stop(browser); stop(server); client.close();
}
