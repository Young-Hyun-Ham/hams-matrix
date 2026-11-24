import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const originalTsconfig = await readFile(resolve("tsconfig.json"), "utf8");
const fixture = await dashboardFixture(),
  origin = "http://localhost:3296",
  artifacts = resolve(".auth-tests/builder-browser");
await mkdir(artifacts, { recursive: true });
await fixture.db.execute(
  "UPDATE users SET account_role='team_admin' WHERE id='dash-owner'",
);
let server,
  browser,
  socket,
  serial = 0,
  logs = "",
  checks = 0;
const pending = new Map(),
  errors = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch {}
    await pause(200);
  }
  throw Error("Timed out: " + label + "\n" + logs.slice(-2500));
}
function stop(child) {
  if (child?.pid)
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
const navigate = (path) => call("Page.navigate", { url: origin + path });
async function screenshot(name) {
  const r = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    join(artifacts, name + ".png"),
    Buffer.from(r.data, "base64"),
  );
}
async function clickText(text) {
  return evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(!e)throw Error('missing button');e.click();return true;})()`,
  );
}
async function checkScenarioModalTheme(mode) {
  await navigate('/react-flow/scenario-list');
  await waitFor(() => evaluate("[...document.querySelectorAll('.MuiCard-root')].some(x=>x.textContent.includes('Browser Builder'))"), 'scenario card');
  await evaluate("[...document.querySelectorAll('.MuiCard-root')].find(x=>x.textContent.includes('Browser Builder')).click()");
  await waitFor(() => evaluate("!!document.querySelector('#scenario-editor-title') && !!document.querySelector('[role=dialog] input')"), 'scenario detail modal');
  const colors = await evaluate(`(()=>{
    const dialog=document.querySelector('[role=dialog]');
    const input=dialog.querySelector('.MuiOutlinedInput-root');
    const body=input.parentElement.parentElement.parentElement;
    return {body:getComputedStyle(body).backgroundColor,image:getComputedStyle(body).backgroundImage,input:getComputedStyle(input).backgroundColor,text:getComputedStyle(dialog.querySelector('input')).color};
  })()`);
  const rgb = value => value.match(/[\d.]+/g).slice(0,3).map(Number);
  const brightness = value => rgb(value).reduce((a,b)=>a+b,0)/3;
  assert.equal(colors.image, 'none');
  for (const surface of [colors.body, colors.input]) {
    assert.ok(mode === 'dark' ? brightness(surface)<100 : brightness(surface)>200, JSON.stringify(colors));
    assert.ok(Math.abs(brightness(colors.text)-brightness(surface))>100, JSON.stringify(colors));
  }
  await screenshot('scenario-modal-'+mode);
  await call('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor(()=>evaluate("!document.querySelector('#scenario-editor-title')"),'detail modal closed');
  checks++;
}
async function checkCanvasPanels(mode) {
  await evaluate("(()=>{const input=document.querySelector('input[class*=searchInput]');if(!input || !input.getBoundingClientRect().width)document.querySelector('button[title=\"Search nodes\"]').click()})()");
  await waitFor(()=>evaluate("!!document.querySelector('input[class*=searchInput]') && document.querySelector('input[class*=searchInput]').getBoundingClientRect().width>0"),'canvas search opens');
  await evaluate(`(()=>{const e=document.querySelector('input[class*=searchInput]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Preview');e.dispatchEvent(new Event('input',{bubbles:true}));e.focus()})()`);
  await waitFor(()=>evaluate("!!document.querySelector('[class*=searchResultCard]')"),'search results');
  const result=await evaluate(`(()=>{
    const input=document.querySelector('input[class*=searchInput]');
    const row=input.parentElement;const select=row.querySelector('[role=combobox]');
    const a=select.getBoundingClientRect(),b=input.getBoundingClientRect();
    const card=document.querySelector('[class*=searchResultCard]');
    return {overlap:a.right>b.left,background:getComputedStyle(card).backgroundColor,color:getComputedStyle(card.querySelector('[class*=searchResultText]')).color};
  })()`);
  assert.equal(result.overlap,false,JSON.stringify(result));
  const brightness = value => value.match(/[\d.]+/g).slice(0,3).map(Number).reduce((a,b)=>a+b,0)/3;
  assert.ok(mode==='dark'?brightness(result.background)<100:brightness(result.background)>200,JSON.stringify(result));
  assert.ok(Math.abs(brightness(result.background)-brightness(result.color))>100,JSON.stringify(result));
  await screenshot('canvas-search-'+mode);checks++;
  await evaluate("document.querySelector('button[title=\"Scenario tabs\"]').click()");
  await waitFor(()=>evaluate("!!document.querySelector('#scenario-tab-menu .Mui-selected')"),'tabs menu');
  const tab=await evaluate("(()=>{const e=document.querySelector('#scenario-tab-menu .Mui-selected');return {background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}})()");
  assert.ok(mode==='dark'?brightness(tab.background)<100:brightness(tab.background)>180,JSON.stringify(tab));
  assert.ok(Math.abs(brightness(tab.background)-brightness(tab.color))>100,JSON.stringify(tab));
  await screenshot('canvas-tabs-'+mode);checks++;
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
}
try {
  server = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "dev", "--port", "3296"],
    {
      windowsHide: true,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: fixture.url,
        TURSO_AUTH_TOKEN: "",
        APP_URL: origin,
        OPENAI_API_KEY: "synthetic-disabled",
        NEXT_TELEMETRY_DISABLED: "1",
        MATRIX_TEST_DIST_DIR: ".auth-tests/builder-next",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (d) => (logs += d));
  server.stderr.on("data", (d) => (logs += d));
  await waitFor(async () => {
    try {
      return (await fetch(origin + "/login")).ok;
    } catch {
      return false;
    }
  }, "Next dev server");
  const unauth = await fetch(origin + "/api/builder/scenarios");
  assert.equal(unauth.status, 401);
  checks++;
  const profile = join(fixture.folder, "builder-browser");
  browser = spawn(
    process.env.MATRIX_TEST_BROWSER ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let port;
  await waitFor(async () => {
    port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
      "\n",
    )[0];
    return !!port;
  }, "Chrome");
  const targets = await (
    await fetch("http://localhost:" + port + "/json/list")
  ).json();
  socket = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Page.javascriptDialogOpening")
      void call("Page.handleJavaScriptDialog", { accept: true });
    if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.exception?.description ??
          m.params.exceptionDetails.text,
      );
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    }
  };
  for (const method of ["Page.enable", "Runtime.enable", "Network.enable"])
    await call(method);
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Network.setCookie", {
    name: "hams_session",
    value: "dash-owner-session",
    url: origin,
    httpOnly: true,
    sameSite: "Lax",
  });
  await navigate("/react-flow/scenario-list");
  await waitFor(
    () => evaluate("!!document.querySelector('.builder-root input')"),
    "builder list",
  );
  checks++;
  const response = await evaluate(
    `(async()=>{const r=await fetch('/api/builder/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Browser Builder',nodes:[{id:'start',type:'message',position:{x:80,y:80},data:{content:'Preview message',title:'Start'}}],edges:[],startNodeId:'start'})});const data=await r.json();window.__builderTest=data.scenario;return {status:r.status,data};})()`,
  );
  assert.equal(response.status, 201, JSON.stringify(response.data));
  const id = response.data.scenario.id;
  checks++;
  await navigate("/react-flow/scenario-list");
  await waitFor(
    () => evaluate("document.body.innerText.includes('Browser Builder')"),
    "created scenario in list",
  );
  await screenshot("list-light");
  checks++;
  await checkScenarioModalTheme('light');
  await navigate("/react-flow/scenario-flow?scenarioId=" + id);
  await waitFor(
    () => evaluate("document.querySelectorAll('.react-flow__node').length===1"),
    "direct detail hydration",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='Orkes')",
    ),
    false,
  );
  checks++;
  await screenshot("detail-light");
  await checkCanvasPanels('light');
  await clickText("\uC800\uC7A5");
  await waitFor(
    () => evaluate("!!document.querySelector('#builder-dialog-title')"),
    "save confirmation",
  );
  await clickText("\uD655\uC778");
  await waitFor(
    () =>
      evaluate(
        "fetch('/api/builder/scenarios/" +
          id +
          "').then(r=>r.json()).then(x=>x.scenario.revision>=2)",
      ),
    "saved editor",
  );
  checks++;
  await clickText("\uBC84\uC804 \uC0DD\uC131");
  await waitFor(
    () => evaluate("!!document.querySelector('#builder-dialog-title')"),
    "publish confirmation",
  );
  await clickText("\uD655\uC778");
  await waitFor(
    () =>
      evaluate(
        "fetch('/api/builder/scenarios/" +
          id +
          "').then(r=>r.json()).then(x=>x.scenario.latest_version===1)",
      ),
    "published editor",
  );
  checks++;

  const toggle = "button[aria-label='다크 모드']";
  await waitFor(
    () =>
      evaluate(
        `!!document.querySelector(${JSON.stringify(toggle)})&&!document.querySelector(${JSON.stringify(toggle)}).disabled`,
      ),
    "theme toggle ready",
  );
  await evaluate(`document.querySelector(${JSON.stringify(toggle)}).click()`);
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.builder-root')?.dataset.builderTheme==='dark'",
      ),
    "dark theme",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.react-flow__node').length"),
    1,
  );
  await screenshot("detail-dark");
  checks++;
  await checkCanvasPanels('dark');
  await checkScenarioModalTheme('dark');
  await navigate('/react-flow/scenario-flow?scenarioId='+id);
  await waitFor(()=>evaluate("document.querySelectorAll('.react-flow__node').length===1"),'return to dark editor');
  const preview = await evaluate(
    "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/simulator|시뮬레이터/i.test(x.title));if(!b)return false;b.click();return true;})()",
  );
  assert.equal(preview, true, "simulator action");
  await waitFor(
    () => evaluate("!!document.querySelector('.builder-emulator')"),
    "active emulator",
  );
  await screenshot("simulator-dark");
  await waitFor(()=>evaluate("document.querySelector('.builder-emulator')?.innerText.includes('Preview message')"),'preview executes message');
  await evaluate("document.querySelector('button[aria-label=\"\uC2DC\uB098\uB9AC\uC624 \uCD08\uAE30\uD654\"]').click()");
  await waitFor(()=>evaluate("document.querySelector('.builder-emulator')?.innerText.includes('Preview message')"),'preview resets and executes');checks++;

  checks++;
  const close = await evaluate(
    "(()=>{const b=document.querySelector('button[aria-label=\"시뮬레이터 닫기\"]');b?.click();return !!b;})()",
  );
  assert.equal(close, true);
  await waitFor(
    () => evaluate("!document.querySelector('.builder-emulator')"),
    "simulator unmounted",
  );
  checks++;
  await navigate("/react-flow/scenario-view?scenarioId=" + id);
  await waitFor(
    () => evaluate("!!document.querySelector('.react-flow')"),
    "version view",
  );
  await screenshot("version-dark");
  checks++;
  await navigate("/form-builder");
  await waitFor(
    () => evaluate("!!document.querySelector('.builder-root input')"),
    "form builder",
  );
  await screenshot("form-dark");
  checks++;
  await call("Page.reload");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.builder-root')?.dataset.builderTheme==='dark'&&!!document.querySelector('.builder-root input')",
      ),
    "dark theme reload",
  );
  checks++;
  await call("Network.setCookie", {
    name: "hams_session",
    value: "dash-viewer-session",
    url: origin,
    httpOnly: true,
    sameSite: "Lax",
  });
  await navigate("/react-flow/scenario-list");
  await waitFor(
    () => evaluate("document.body.innerText.includes('관리자만')"),
    "viewer access denied",
  );
  checks++;
  assert.deepEqual(errors, []);
  console.log(
    `Builder browser: ${checks} checks passed; screenshots in .auth-tests/builder-browser`,
  );
} finally {
  if (socket?.readyState === 1) {
    try {
      await writeFile(
        join(artifacts, "failure-state.json"),
        JSON.stringify(
          {
            errors,
            state: await evaluate(
              "({url:location.href,body:document.body.innerText,root:!!document.querySelector('.builder-root')})",
            ),
          },
          null,
          2,
        ),
      );
      await screenshot("last-state");
    } catch {}
  }
  await writeFile(join(artifacts, "server.log"), logs);
  socket?.close();
  stop(browser);
  stop(server);
  const currentConfig = JSON.parse(await readFile(resolve("tsconfig.json"), "utf8"));
  const originalConfig = JSON.parse(originalTsconfig);
  currentConfig.include = currentConfig.include.filter(value => !value.startsWith('.auth-tests/builder-next/') || originalConfig.include.includes(value));
  if (JSON.stringify(currentConfig) === JSON.stringify(originalConfig)) await writeFile(resolve('tsconfig.json'), originalTsconfig);
  fixture.db.close();
}
