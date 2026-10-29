// Isolated browser regression: synthetic Markdown and SQLite only, never the member DB/docs.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { bootstrapMaster } from "./lib/bootstrap-master.mjs";

const development = process.argv.includes("--dev");
const baseline = process.argv.includes("--baseline");
const root = process.cwd();
await mkdir(".auth-tests", { recursive: true });
const serverRoot = await mkdtemp(resolve(".auth-tests/viewer-"));
const artifacts = await mkdtemp(join(tmpdir(), "matrix-viewer-"));
const origin = "http://localhost:3259", debug = "http://127.0.0.1:9359";
const client = createClient({ url: pathToFileURL(join(artifacts, "test.db")).href });
let server, browser, socket, sequence = 0;
const pending = new Map();
const errors = [];
const pause = ms => new Promise(done => setTimeout(done, ms));
async function waitFor(fn, label) {
  for (let n = 0; n < 800; n++) {
    try { const value = await fn(); if (value) return value; } catch { /* Navigation/startup can be in progress. */ }
    await pause(150);
  }
  throw new Error(`Timed out: ${label}`);
}
function cdp(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, method === "Page.navigate" ? 120000 : 30000);
    pending.set(id, { resolve: result => { clearTimeout(timer); resolve(result); }, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function navigate(path, selector) {
  await cdp("Page.navigate", { url: origin + path });
  await ready(path, selector);
}
async function ready(path, selector) {
  await waitFor(() => evaluate(`location.pathname+location.search===${JSON.stringify(path)} && !!document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().width`), path);
  await waitFor(() => evaluate(`!document.querySelector('.theme-toggle')?.disabled`), "hydration and preferences");
  await pause(350);
}
// /viewer has no navigation menu entry. Use the mounted App Router context so this
// tests real client transitions (a Page.navigate would discard retained styles).
async function transition(path, selector) {
  await evaluate(`(()=>{const element=document.querySelector('.main-content');let fiber=element[Object.keys(element).find(k=>k.startsWith('__reactFiber$'))];for(;fiber;fiber=fiber.return){for(let context=fiber.dependencies?.firstContext;context;context=context.next){const router=context.memoizedValue;if(router?.push&&router?.prefetch){router.push(${JSON.stringify(path)});return;}}}throw new Error('App Router context not found');})()`);
  await ready(path, selector);
}
async function click(selector) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing element');e.focus();e.click();})()`);
  await pause(200);
}
async function setValue(selector, value) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(200);
}
async function theme(mode) {
  if (await evaluate("document.documentElement.dataset.theme") !== mode) await click(".theme-toggle");
  await waitFor(() => evaluate(`document.documentElement.dataset.theme===${JSON.stringify(mode)} && !document.querySelector('.theme-toggle').disabled`), mode);
}
async function metrics() {
  return evaluate(`(()=>{const result={theme:document.documentElement.dataset.theme,bodyStyle:document.body.getAttribute('style')};for(const selector of ['body','.workspace','.workspace-body','.brand','.sidebar','.topbar','.main-content','.settings-form input','.settings-form .button']){const e=document.querySelector(selector);if(!e)continue;const s=getComputedStyle(e);result[selector]=Object.fromEntries(['fontFamily','fontSize','lineHeight','color','backgroundColor','padding','border','minHeight','overflow','display','position','gridTemplateColumns','flexDirection','width','height'].map(k=>[k,s[k]]));}return result;})()`);
}
async function screenshot(name) {
  const result = await cdp("Page.captureScreenshot", { format: "png" });
  await writeFile(join(artifacts, name + ".png"), Buffer.from(result.data, "base64"));
}
function stop(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGTERM");
}

const fixture = "# Viewer fixture\n\n본문 검색키워드 `inline code`\n\n[다음 문서](nested/02-second.md#두번째-제목)\n\n## First section\n\n> 인용문\n\n```js\nconst answer = 42;\n```\n\n| Low | Medium | High | Critical |\n| --- | --- | --- | --- |\n| A: low | B: medium | C: high | D: critical |\n| S | M | L | XL |\n\n" + Array.from({ length: 30 }, (_, i) => `### Section ${i}\n\nLong content paragraph ${i}.\n\n`).join("");
try {
  for (const name of ["app", "components", "lib", "stores", "styles", "public", "tsconfig.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"])
    await cp(join(root, name), join(serverRoot, name), { recursive: true });
  const config = await readFile("next.config.ts", "utf8");
  await writeFile(join(serverRoot, "next.config.ts"), config.replace("turbopack: {", `turbopack: { root: ${JSON.stringify(root)},`));
  await symlink(join(root, "node_modules"), join(serverRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  if (!development) await symlink(join(root, ".next"), join(serverRoot, ".next"), process.platform === "win32" ? "junction" : "dir");
  await mkdir(join(serverRoot, "docs/nested"), { recursive: true });
  await writeFile(join(serverRoot, "docs/01-viewer-fixture.md"), fixture);
  await writeFile(join(serverRoot, "docs/nested/02-second.md"), "# Second document\n\n## 두번째 제목\n\nSecond content\n");
  for (let i = 3; i <= 14; i++) await writeFile(join(serverRoot, `docs/${i}-long-document-name-for-tabs.md`), `# Document ${i}\n\n## Detail\n\nBody\n`);
  for (const name of (await readdir("db/migrations")).filter(n => n.endsWith(".sql")).sort())
    await client.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  const password = randomUUID() + "Aa1!";
  await bootstrapMaster(client, password);
  server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), development ? "dev" : "start", "--port", "3259"], {
    cwd: serverRoot, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TURSO_DATABASE_URL: pathToFileURL(join(artifacts, "test.db")).href, TURSO_AUTH_TOKEN: "", APP_URL: origin, OPENAI_API_KEY: "", OPENAI_MODELS: "", NEXT_TELEMETRY_DISABLED: "1" },
  });
  // Only retain compiler diagnostics, never HTTP bodies, environment values or credentials.
  server.stderr.on("data", data => errors.push(String(data)));
  server.stdout.resume();
  await waitFor(async () => (await fetch(origin + "/login")).ok, "Next server");
  const login = await fetch(origin + "/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: "master@hamsfam.co.kr", password }) });
  assert.equal(login.status, 200, "fixture login");
  let executable = process.env.MATRIX_TEST_BROWSER;
  if (!executable) for (const candidate of ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe"]) {
    try { await access(candidate); executable = candidate; break; } catch { /* Check next executable. */ }
  }
  if (!executable) throw new Error("Set MATRIX_TEST_BROWSER to a Chromium/Edge executable.");
  browser = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=9359", `--user-data-dir=${join(artifacts, "browser")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  await waitFor(async () => (await fetch(debug + "/json/version")).ok, "browser");
  const target = await (await fetch(debug + "/json/new?about:blank", { method: "PUT" })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const result = JSON.parse(String(data)), item = pending.get(result.id);
    if (!item) return;
    pending.delete(result.id);
    if (result.error) item.reject(new Error(result.error.message)); else item.resolve(result.result);
  });
  await cdp("Page.enable"); await cdp("Network.enable");
  for (const cookie of login.headers.getSetCookie()) {
    const part = cookie.split(";")[0], at = part.indexOf("=");
    await cdp("Network.setCookie", { name: part.slice(0, at), value: part.slice(at + 1), url: origin, httpOnly: true });
  }
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const settings = "/settings?tab=interface", viewer = "/viewer?document=01-viewer-fixture.md";
  const comparisons = [];
  for (const mode of ["light", "dark"]) {
    await navigate(settings, ".settings-form"); await theme(mode);
    const before = await metrics();
    await transition(viewer, "article");
    const viewerMetrics = await evaluate(`(()=>{const a=document.querySelector('article');return {background:getComputedStyle(a.parentElement).backgroundColor,text:getComputedStyle(a).color,headings:a.querySelectorAll('h1,h2,h3').length,mainCount:document.querySelectorAll('main').length};})()`);
    await screenshot((baseline ? "baseline-" : "") + "viewer-" + mode);
    await transition(settings, ".settings-form");
    const after = await metrics();
    const changed = Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    comparisons.push({ mode, changed, viewer: viewerMetrics });
    if (!baseline) assert.deepEqual(after, before, `styles after viewer roundtrip (${mode})`);
  }
  await writeFile(join(artifacts, "style-comparison.json"), JSON.stringify(comparisons, null, 2));
  console.log(JSON.stringify(comparisons));
  if (!baseline) {
    await transition(viewer, "article");
    assert.equal(await evaluate("document.querySelectorAll('main').length"), 1, "one document main landmark");
    assert.equal(await evaluate("document.querySelectorAll('[class*=Mui]').length"), 0, "no MUI components");
    assert.ok(await evaluate("!!document.querySelector('.lucide-copy') && !!document.querySelector('.lucide-search') && !!document.querySelector('.lucide-folder')"));
    const bounds = await evaluate("(()=>{const m=document.querySelector('main'),v=m.querySelector('section');const a=m.getBoundingClientRect(),b=v.getBoundingClientRect(),s=getComputedStyle(m);return {padding:s.padding,main:[a.left,a.top,a.right,a.bottom],viewer:[b.left,b.top,b.right,b.bottom]}})()");
    console.log("Viewer bounds", bounds);
    assert.ok(bounds.padding === "0px" && Math.abs(bounds.main[0]-bounds.viewer[0])<=1 && Math.abs(bounds.main[2]-bounds.viewer[2])<=1 && Math.abs(bounds.main[1]-bounds.viewer[1])<=1, "viewer fills main area");
    const darkPaper = await evaluate("getComputedStyle(document.querySelector('article').parentElement).backgroundColor");
    await theme("light");
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('article').parentElement).backgroundColor"), darkPaper);
    await setValue('aside input', "no-such-fixture");
    await waitFor(() => evaluate("!!document.querySelector('aside li[class*=emptyList]')"), "empty search result");
    await setValue('aside input', "");
    await click('article a');
    await waitFor(() => evaluate("document.querySelector('article h1')?.textContent==='Second document'"), "relative Markdown link");
    assert.equal(await evaluate("document.querySelectorAll('[role=tab]').length"), 2);
    await click('[role=tab]');
    await waitFor(() => evaluate("document.querySelector('article h1')?.textContent==='Viewer fixture'"), "first tab");
    await click('button[value="source"]');
    await waitFor(() => evaluate("!!document.querySelector('[role=tabpanel] textarea')"), "source editor");
    assert.equal(await evaluate("document.querySelector('[role=tabpanel] textarea').value"), fixture);
    await setValue('[role=tabpanel] textarea', fixture + "\nDraft fixture\n");
    assert.ok(await evaluate("!document.querySelector('button[class*=saveButton]').disabled"));
    await click('button[class*=saveButton]');
    await waitFor(() => evaluate("!!document.querySelector('[role=status]')?.textContent.trim()"), "save failure status");
    assert.equal(await readFile(join(serverRoot, "docs/01-viewer-fixture.md"), "utf8"), fixture, "no Markdown writes");
    await theme("dark");
    const darkEditor = await evaluate("getComputedStyle(document.querySelector('[role=tabpanel] textarea')).backgroundColor");
    await theme("light");
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('[role=tabpanel] textarea')).backgroundColor"), darkEditor);
    await click('button[value="preview"]');
    for (const n of [3, 4, 5, 6]) {
      await evaluate("Array.from(document.querySelectorAll('aside button')).find(e=>e.textContent.includes(" + JSON.stringify(`${n}-long-document`) + ")).click()");
      await pause(120);
    }
    await waitFor(() => evaluate("document.querySelectorAll('[role=tab]').length===6"), "scrollable document tabs");
    assert.ok(await evaluate("!!document.querySelector('.lucide-chevron-left') && !!document.querySelector('.lucide-chevron-right')"));
    await click('button[class*=closeOtherTabsButton]');
    assert.equal(await evaluate("document.querySelectorAll('[role=tab]').length"), 1);
    for (const width of [1000, 720, 390]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await pause(250);
      assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `no page overflow at ${width}`);
      await screenshot("viewer-" + width);
    }
    await click('button[class*=tabCloseButton]');
    assert.ok(await evaluate("!!document.querySelector('.lucide-info') && !document.querySelector('article')"));
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await transition(settings, ".settings-form");
    await evaluate("history.back()");
    await ready(viewer, 'main > section');
    await evaluate("history.forward()"); await ready(settings, ".settings-form");
    console.log("PASS: light/dark client roundtrips, shared styles, icons, relative links, tabs, source drafts, missing-API failure, 1440/1000/720/390px and browser history.");
  }
  console.log("Synthetic evidence: " + artifacts);
} catch (error) {
  if (socket?.readyState === 1) { try { await screenshot("failure"); } catch { /* Keep original error. */ } }
  console.error("Synthetic evidence: " + artifacts);
  console.error(errors.join("").slice(-3000));
  throw error;
} finally {
  socket?.close(); stop(browser); stop(server); client.close();
}
