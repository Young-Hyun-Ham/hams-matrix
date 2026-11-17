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
const diagrams = [
  'flowchart TD\n A["시작"] --> B["완료"]',
  'sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Reply',
  'classDiagram\n Animal <|-- Duck\n Animal : +int age',
  'stateDiagram-v2\n [*] --> Ready\n Ready --> Done\n Done --> [*]',
  'erDiagram\n CUSTOMER ||--o{ ORDER : places\n CUSTOMER {\n int id\n }',
  'gantt\n dateFormat YYYY-MM-DD\n section Work\n Task :a1, 2026-11-17, 2d',
];
const longTitles = ['가'.repeat(20), 'A'.repeat(40), '가'.repeat(10) + 'a'.repeat(20), 'W'.repeat(40)];
const enhancedFixture = '# Enhanced viewer\n\n' + [1, 2, 3].flatMap(level => longTitles.map(text => '#'.repeat(level) + ' ' + text + '\n\n')).join('') +
  diagrams.map(code => '```mermaid\n' + code + '\n```\n\n').join('') +
  '```mermaid\nflowchart TD\n A --> [\n```\n\n' +
  '```mermaid\n%%{init: {"securityLevel":"loose"}}%%\nflowchart TD\n A-->B\n```\n\n' +
  '```mermaid\n\n```\n\n' +
  '````text\n# fenced fake heading\n```\n## still fenced\n````\n\n~~~text\n# tilde fake heading\n~~~\n\n' +
  Array.from({ length: 110 }, (_, i) => `### Long section ${i}\n\nParagraph ${i}.\n\n`).join('');
try {
  for (const name of ["app", "components", "lib", "stores", "styles", "public", "tsconfig.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"])
    await cp(join(root, name), join(serverRoot, name), { recursive: true });
  const config = await readFile("next.config.ts", "utf8");
  await writeFile(join(serverRoot, "next.config.ts"), config.replace("turbopack: {", `turbopack: { root: ${JSON.stringify(root)},`));
  await symlink(join(root, "node_modules"), join(serverRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  if (!development) await symlink(join(root, ".next"), join(serverRoot, ".next"), process.platform === "win32" ? "junction" : "dir");
  await mkdir(join(serverRoot, "docs/nested"), { recursive: true });
  await writeFile(join(serverRoot, "docs/01-viewer-fixture.md"), fixture);
  await writeFile(join(serverRoot, "docs/20-enhanced-viewer.md"), enhancedFixture);
  await writeFile(join(serverRoot, "docs/21-no-outline.md"), '# Single heading\n\nOnly content.\n');
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
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"열린 문서\"] [role=tab]').length"), 2);
    await click('[aria-label="열린 문서"] [role=tab]');
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
    await waitFor(() => evaluate("document.querySelectorAll('[aria-label=\"열린 문서\"] [role=tab]').length===6"), "scrollable document tabs");
    assert.ok(await evaluate("!!document.querySelector('.lucide-chevron-left') && !!document.querySelector('.lucide-chevron-right')"));
    await click('button[class*=closeOtherTabsButton]');
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"열린 문서\"] [role=tab]').length"), 1);
    for (const width of [1000, 720, 390]) {
      await cdp("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false });
      await pause(250);
      assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"), `no page overflow at ${width}`);
      await screenshot("viewer-" + width);
    }
    await click('button[class*=tabCloseButton]');
    assert.ok(await evaluate("!!document.querySelector('.lucide-info') && !document.querySelector('article')"));
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });
    await evaluate("Array.from(document.querySelectorAll('aside button')).find(e=>e.textContent.includes('20-enhanced-viewer')).click()");
    await waitFor(() => evaluate("document.querySelectorAll('[data-mermaid-block]').length===9"), "Mermaid blocks");
    await evaluate("document.fonts.ready");
    const outlineSelector = 'nav[aria-label="이 문서의 목차"]';
    const readerSelector = '[data-view-mode="preview"]';
    await waitFor(() => evaluate("document.querySelector('[data-outline-fits=true]') !== null"), "measured outline");
    const layout = () => evaluate(`(()=>{const r=document.querySelector('${readerSelector}'),p=document.querySelector('article').parentElement,n=document.querySelector('${outlineSelector}');return {reader:r.clientWidth,paper:p.getBoundingClientRect().width,outlineWidth:n.getBoundingClientRect().width,outline:getComputedStyle(n).display}})()`);
    const expanded = await layout();
    await click('.menu-toggle'); await pause(300);
    const collapsed = await layout();
    assert.ok(Math.abs(collapsed.reader-expanded.reader-176)<=2, JSON.stringify({expanded,collapsed}));
    assert.ok(collapsed.paper>900 && Math.abs(collapsed.paper-expanded.paper-176)<=2, "only paper receives sidebar space");
    assert.ok(Math.abs(collapsed.outlineWidth-expanded.outlineWidth)<=2, "outline width stays fixed when menu collapses");
    assert.ok(Math.abs(expanded.paper / (expanded.paper + expanded.outlineWidth) - 0.7) < 0.002, JSON.stringify(expanded));
    await click('.menu-toggle'); await pause(300);
    const restored = await layout();
    assert.ok(Math.abs(restored.outlineWidth-expanded.outlineWidth)<=2 && Math.abs(restored.paper-expanded.paper)<=2, "expanded menu restores original layout");
    const widthResults = await evaluate(`Array.from(document.querySelectorAll('${outlineSelector} button')).slice(1,13).map(e=>({text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth,height:e.clientHeight,whiteSpace:getComputedStyle(e).whiteSpace}))`);
    assert.ok(widthResults.every(item=>item.height>=30 && item.whiteSpace==='nowrap'), JSON.stringify(widthResults));
    assert.ok(widthResults.some(item=>item.scroll>item.width), "long titles truncate instead of widening the outline");
    assert.ok(await evaluate(`!Array.from(document.querySelectorAll('${outlineSelector} button')).some(e=>/fenced|still fenced/.test(e.textContent))`), "fenced headings excluded");
    const linksSelector = outlineSelector + ' [role=region]';
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${linksSelector}')).scrollbarWidth`), 'none');
    assert.ok(await evaluate(`(()=>{const e=document.querySelector('${linksSelector}');return e.scrollHeight>e.clientHeight})()`), "outline is height constrained");
    async function wheelOver(selector, deltaY) {
      const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+Math.min(10,r.height/2)}})()`);
      await cdp('Input.dispatchMouseEvent', {type:'mouseMoved',...point});
      await cdp('Input.dispatchMouseEvent', {type:'mouseWheel',...point,deltaX:0,deltaY});
      await pause(250);
    }
    await evaluate(`document.querySelector('${readerSelector}').scrollTop=0;document.querySelector('${linksSelector}').scrollTop=0`);
    await wheelOver(linksSelector, 220);
    assert.ok(await evaluate(`document.querySelector('${linksSelector}').scrollTop>0 && document.querySelector('${readerSelector}').scrollTop===0`), "native wheel only scrolls outline");
    await wheelOver(outlineSelector+' strong', 180);
    assert.ok(await evaluate(`document.querySelector('${linksSelector}').scrollTop>220 && document.querySelector('${readerSelector}').scrollTop===0`), "outline heading forwards wheel");
    await evaluate(`document.querySelector('${linksSelector}').scrollTop=999999`);
    await wheelOver(linksSelector, 300);
    assert.equal(await evaluate(`document.querySelector('${readerSelector}').scrollTop`), 0, "outline end does not chain");
    await wheelOver(linksSelector, -220);
    assert.ok(await evaluate(`(()=>{const e=document.querySelector('${linksSelector}');return e.scrollTop<e.scrollHeight-e.clientHeight-100})()`), "reverse outline scroll");
    assert.equal(await evaluate("document.querySelectorAll('[data-mermaid-block] svg').length"), 0, "text is default");
    const diagramLabels = [['시작','완료'], ['Alice','Bob','Hello'], ['Animal','Duck','age'], ['Ready','Done'], ['CUSTOMER','ORDER','places'], ['Work','Task']];
    for (let i=0;i<diagrams.length;i++) {
      await click(`[data-mermaid-block]:nth-of-type(${i+1}) [role=tab]:last-child`);
      await waitFor(() => evaluate(`!!document.querySelectorAll('[data-mermaid-block]')[${i}].querySelector('svg[role=img]')`), `diagram ${i}`);
      assert.ok(await evaluate(`document.querySelectorAll('[data-mermaid-block]')[${i}].querySelectorAll('text,tspan,path,rect').length>0`));
      const labelText = await evaluate(`document.querySelectorAll('[data-mermaid-block]')[${i}].querySelector('svg').textContent`);
      assert.ok(diagramLabels[i].every(label=>labelText.includes(label)), `missing diagram labels ${i}`);
    }
    assert.equal(await evaluate("document.querySelectorAll('[data-mermaid-block] foreignObject').length"), 0);
    assert.ok(await evaluate("!document.querySelector('pre [role=tablist]')"), "valid pre replacement");
    await click('[data-mermaid-block] [role=tab]:last-child');
    assert.equal(await evaluate("document.querySelector('[data-mermaid-block] [role=status]')"), null, "reselect does not leave loading state");
    for (let i=6;i<9;i++) {
      await evaluate(`document.querySelectorAll('[data-mermaid-block]')[${i}].querySelectorAll('[role=tab]')[1].click()`);
      await waitFor(() => evaluate(`!!document.querySelectorAll('[data-mermaid-block]')[${i}].querySelector('[role=status]')?.textContent && !document.querySelectorAll('[data-mermaid-block]')[${i}].querySelector('[role=status]')?.textContent.includes('불러오는')`), `diagram error ${i}`);
    }
    await theme('dark');
    await waitFor(() => evaluate("document.querySelectorAll('[data-mermaid-block] svg').length===6 && !document.querySelector('[data-mermaid-block]').querySelector('[role=status]')"), "dark diagram rerender");
    const darkSvg = await evaluate("getComputedStyle(document.querySelector('[data-mermaid-block] svg rect')).fill");
    await theme('light');
    await waitFor(() => evaluate("document.querySelectorAll('[data-mermaid-block] svg').length===6 && !document.querySelector('[data-mermaid-block]').querySelector('[role=status]')"), "light diagram rerender");
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('[data-mermaid-block] svg rect')).fill"), darkSvg);
    await screenshot('viewer-enhanced-mermaid');
    await click('[data-mermaid-block] [role=tab]:first-child');
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});
    await waitFor(() => evaluate("document.querySelector('[data-mermaid-block] [role=tab]:last-child').getAttribute('aria-selected')==='true'"), "keyboard Mermaid tab");
    await evaluate("document.querySelector('.workspace-page-content').style.width='700px'");
    await waitFor(() => evaluate("document.querySelector('[data-outline-fits]').dataset.outlineFits==='false'"), "nested page width hides outline");
    assert.equal(await evaluate("innerWidth"), 1920, "outline responds to nested width independently of viewport");
    await evaluate("document.querySelector('.workspace-page-content').style.removeProperty('width')");
    await waitFor(() => evaluate("document.querySelector('[data-outline-fits]').dataset.outlineFits==='true'"), "nested width restored");
    for (const width of [1600, 1440, 1200, 1000, 720, 390]) {
      await cdp('Emulation.setDeviceMetricsOverride', {width,height:800,deviceScaleFactor:1,mobile:false});
      await pause(250);
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), `Mermaid page overflow at ${width}`);
      const fit = await evaluate(`(()=>{const r=document.querySelector('${readerSelector}'),n=document.querySelector('${outlineSelector}'),p=document.querySelector('article').parentElement;return {fits:r.dataset.outlineFits,visible:getComputedStyle(n).display!=='none',paper:p.getBoundingClientRect().width,outline:n.getBoundingClientRect().width}})()`);
      assert.equal(fit.visible, fit.fits==='true', `outline fit at ${width}`);
      if (fit.visible) assert.ok(Math.abs(fit.paper / (fit.paper + fit.outline) - 0.7) < 0.002, `7:3 ratio at ${width}`);
    }
    // Switch documents while a freshly requested render may still be pending.
    await evaluate("Array.from(document.querySelectorAll('aside button')).find(e=>e.textContent.includes('21-no-outline')).click()");
    await waitFor(() => evaluate("document.querySelector('article h1')?.textContent==='Single heading'"), "single-heading document");
    await pause(400);
    assert.equal(await evaluate("document.querySelectorAll('[data-mermaid-block],nav[aria-label=\"이 문서의 목차\"]').length"), 0);
    assert.ok(await evaluate(`(()=>{const r=document.querySelector('${readerSelector}'),p=document.querySelector('article').parentElement,s=getComputedStyle(r);return Math.abs(p.getBoundingClientRect().width-r.clientWidth+parseFloat(s.paddingLeft)+parseFloat(s.paddingRight))<=2})()`), "no empty outline column");
    console.log('PASS: expanded-menu 7:3 baseline, fixed outline on menu collapse, paper-only expansion, truncated long headings, hidden real-wheel outline, six Mermaid types, error isolation, theme and keyboard tabs, cancelled renders, no-outline layout.');
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
