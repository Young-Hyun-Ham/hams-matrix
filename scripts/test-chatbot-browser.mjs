import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const require = createRequire(import.meta.url),
  fixture = await dashboardFixture(),
  origin = "http://localhost:3308",
  artifacts = resolve(".auth-tests/chatbot-browser"),
  originalConfig = await readFile("tsconfig.json", "utf8");
const objectBytes = new Map();
const objectServer = createServer(async (request, response) => {
  const key = new URL(request.url, "http://localhost").pathname;
  if (request.method === "PUT") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    objectBytes.set(key, Buffer.concat(chunks));
    response.writeHead(200, { ETag: '"synthetic-object"' }).end();
  } else if (request.method === "GET" && objectBytes.has(key)) {
    const bytes = objectBytes.get(key);
    response
      .writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": bytes.length,
      })
      .end(bytes);
  } else if (request.method === "DELETE") {
    objectBytes.delete(key);
    response.writeHead(204).end();
  } else response.writeHead(404).end();
});
await mkdir(artifacts, { recursive: true });
await fixture.db.execute(
  "UPDATE users SET account_role='team_admin' WHERE id='dash-owner'",
);
const env = {
  ...process.env,
  TURSO_DATABASE_URL: fixture.url,
  TURSO_AUTH_TOKEN: "",
  APP_URL: origin,
  OPENAI_API_KEY: "synthetic-chatbot-browser-key",
  AI_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
  OPENAI_MODELS: "gpt-chatbot-test",
  OPENAI_IMAGE_MODELS: "gpt-image-chatbot-test",
  CHATBOT_TEXT_MODELS: "gpt-chatbot-test",
  CHATBOT_IMAGE_MODELS: "gpt-image-chatbot-test",
  CHATBOT_OPENAI_API_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
  MATRIX_TEST_DIST_DIR: ".auth-tests/chatbot-next",
  NODE_OPTIONS: `--import=${pathToFileURL(resolve("scripts/chatbot-browser-provider.mjs")).href}`,
};
let server,
  worker,
  browser,
  socket,
  serial = 0,
  logs = "",
  checks = 0;
const pending = new Map(),
  errors = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, label, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await fn()) return;
    } catch {}
    await pause(250);
  }
  throw Error("Timed out: " + label + "\n" + errors.slice(-3).join("\n") + "\n" + logs.slice(-3000));
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
async function click(selector) {
  return evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing element');e.click();return true;})()`,
  );
}
async function screenshot(name) {
  const r = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    join(artifacts, name + ".png"),
    Buffer.from(r.data, "base64"),
  );
}
try {
  await new Promise((resolve) => objectServer.listen(0, "127.0.0.1", resolve));
  Object.assign(env, {
    R2_ENDPOINT: `http://127.0.0.1:${objectServer.address().port}`,
    R2_BUCKET_NAME: "synthetic-chatbot-bucket",
    R2_ACCESS_KEY_ID: "synthetic-access-key",
    R2_SECRET_ACCESS_KEY: "synthetic-secret-key",
  });
  server = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "dev", "--port", "3308"],
    { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (d) => (logs += d));
  server.stderr.on("data", (d) => (logs += d));
  worker = spawn(process.execPath, ["scripts/chatbot-worker.mjs"], {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  worker.stderr.on("data", (d) => (logs += d));
  await wait(async () => {
    try {
      return (await fetch(origin + "/login")).ok;
    } catch {
      return false;
    }
  }, "web server");
  assert.equal(
    (await fetch(origin + "/api/chatbot/conversations")).status,
    401,
  );
  checks++;
  const profile = join(fixture.folder, "chatbot-chrome");
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
  await wait(async () => {
    port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
      "\n",
    )[0];
    return !!port;
  }, "Chrome");
  const tabs = await (
    await fetch("http://localhost:" + port + "/json/list")
  ).json();
  socket = new WebSocket(
    tabs.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.exception?.description ||
          m.params.exceptionDetails.text,
      );
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      errors.push(m.params.args.map((item) => item.description ?? item.value).join(" "));
    if (m.method === "Page.javascriptDialogOpening")
      void call("Page.handleJavaScriptDialog", { accept: true });
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      if (m.error) p.reject(m.error);
      else p.resolve(m.result);
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
  await navigate("/dashboard");
  await wait(
    () => evaluate("!!document.querySelector('.chatbot-launcher')"),
    "dashboard host",
  );
  checks++;
  assert.equal(
    await evaluate("document.querySelectorAll('.chatbot-launcher').length"),
    1,
  );
  await click(".chatbot-launcher");
  assert.equal(
    (
      await fixture.db.execute(
        "SELECT COUNT(*) AS n FROM chatbot_conversations",
      )
    ).rows[0].n,
    0,
  );
  checks++;
  await click(".chatbot-launcher-menu button");
  await wait(
    () => evaluate("!!document.querySelector('.chatbot-composer textarea')"),
    "new chat popup",
    25000,
  ).catch(async (error) => {
    const state = await evaluate("JSON.stringify({ path: location.pathname, popup: document.querySelector('.chatbot-root')?.innerText, body: document.body.innerText.slice(-250) })");
    throw new Error(error.message + "\nChatbot state: " + state);
  });
  await wait(
    () =>
      evaluate(
        "document.querySelector('select[data-chatbot-model]')?.value==='gpt-chatbot-test'",
      ),
    "text model",
  );
  await evaluate(
    "(()=>{const e=document.querySelector('.chatbot-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'브라우저 질문');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await evaluate("document.querySelector('.chatbot-composer').requestSubmit()");
  await wait(
    () =>
      evaluate(
        "document.querySelector('.chatbot-messages')?.textContent.includes('브라우저 모의 답변')",
      ),
    "saved model answer",
  );
  checks++;

  await evaluate(
    "(()=>{const e=document.querySelector('.chatbot-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'모호한 정리 요청');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await wait(
    () =>
      evaluate(
        "!document.querySelector('button[aria-label=\"메시지 전송\"]').disabled",
      ),
    "composer ready after previous response",
  );
  await evaluate("document.querySelector('.chatbot-composer').requestSubmit()");
  await wait(
    () => evaluate("!!document.querySelector('.chatbot-clarification')"),
    "generic clarification card",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.chatbot-clarification').textContent.includes('요약')",
    ),
  );
  checks++;
  await evaluate(
    "(()=>{const e=document.querySelector('.chatbot-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'보존할 초안');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await evaluate(
    "Array.from(document.querySelector('.chatbot-clarification').querySelectorAll('button')).find(b=>b.textContent==='상태 새로고침').click()",
  );
  await evaluate(
    "Array.from(document.querySelector('.chatbot-clarification').querySelectorAll('button')).find(b=>b.textContent==='다른 목적').click()",
  );
  await wait(
    () =>
      evaluate(
        "!!document.querySelector('input[aria-label=\"선택 내용 직접 입력\"]')",
      ),
    "inline custom choice",
  );
  await evaluate(
    "(()=>{const e=document.querySelector('input[aria-label=\"선택 내용 직접 입력\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'교육용');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await screenshot("generic-clarification");
  await evaluate(
    "document.querySelector('.chatbot-clarification-input').requestSubmit()",
  );
  await wait(
    () =>
      evaluate(
        "document.querySelector('.chatbot-messages').textContent.includes('선택한 목적을 반영했습니다.')",
      ),
    "resume original question",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.chatbot-composer textarea').value",
    ),
    "보존할 초안",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.chatbot-clarification').textContent.includes('선택 완료: 교육용')",
    ),
  );
  checks += 2;
  await evaluate(
    "(()=>{const e=document.querySelector('.chatbot-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );

  const commandScenario = await evaluate(`
    (async () => {
      const request = async (path, method, data) => {
        const response = await fetch('/api/builder/scenarios' + path, {
          method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok) throw Error(JSON.stringify(result));
        return result.scenario;
      };
      const scenario = await request('', 'POST', {
        name: 'Slash command fixture',
        nodes: [{ id: 'start', type: 'message', position: {x: 0, y: 0}, data: { content: 'Slash command result' } }],
        edges: [], startNodeId: 'start',
      });
      const published = await request('/' + scenario.id + '/versions', 'POST', {
        expectedRevision: scenario.revision, requestId: 'slash-publish',
      });
      const deployed = await request('/' + scenario.id + '/deployments', 'POST', {
        expectedRevision: published.revision, requestId: 'slash-deploy', versionNumber: 1,
      });
      return request('/' + scenario.id + '/command', 'PATCH', {
        expectedRevision: deployed.revision, enabled: true,
      });
    })()
  `);
  const commandSelector = '.chatbot-command-menu button[role="menuitem"]';
  const selectCommand = async () => {
    await wait(() => evaluate(`document.querySelector('${commandSelector}')?.textContent.trim() === 'Slash command fixture'`), 'registered scenario');
    await click(commandSelector);
    await wait(() => evaluate(`document.querySelector('.chatbot-scenario-picker select')?.value === ${JSON.stringify(commandScenario.id)}`), 'scenario preselected');
  };
  await evaluate(
    "document.querySelector('.chatbot-composer textarea').focus()",
  );
  await call("Input.insertText", { text: "/" });
  await wait(
    () => evaluate("!!document.querySelector('.chatbot-command-menu')"),
    "slash command menu",
  );
  await selectCommand();
  await click('.chatbot-scenario-header button');
  assert.equal(
    await evaluate(
      "document.querySelector('.chatbot-composer textarea').value",
    ),
    "",
  );
  checks++;
  await evaluate(
    "document.querySelector('.chatbot-composer textarea').focus()",
  );
  await call("Input.insertText", { text: "초안 /" });
  await wait(
    () => evaluate("!!document.querySelector('.chatbot-command-menu')"),
    "slash command inside draft",
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
  });
  assert.equal(
    await evaluate("!!document.querySelector('.chatbot-command-menu')"),
    false,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.chatbot-composer textarea').value",
    ),
    "초안 /",
  );
  await call("Input.insertText", { text: "/" });
  await wait(
    () => evaluate("!!document.querySelector('.chatbot-command-menu')"),
    "reopen slash command",
  );
  await selectCommand();
  assert.equal(await evaluate("!!document.querySelector('.chatbot-run-status')"), false);
  await click(".chatbot-scenario-picker .chatbot-primary");
  await wait(() => evaluate("document.querySelector('.chatbot-scenario-panel').textContent.includes('Slash command result')"), "scenario result");
  await click(".chatbot-scenario-header button");
  assert.equal(await evaluate("document.querySelector('.chatbot-scenario-panel').hidden"), true);
  await click(".chatbot-header button[aria-controls='chatbot-scenario-panel']");
  await wait(() => evaluate("!document.querySelector('.chatbot-scenario-panel').hidden && document.querySelector('.chatbot-scenario-panel').textContent.includes('Slash command result')"), "scenario restored");
  await click(".chatbot-scenario-header button");
  assert.equal(
    await evaluate(
      "document.querySelector('.chatbot-composer textarea').value",
    ),
    "초안 /",
  );
  checks++;
  await click(".chatbot-command-toggle");
  await click('.chatbot-command-menu button[title="시각화 및 수정"]');
  await wait(
    () =>
      evaluate(
        "!document.querySelector('select[data-chatbot-model]') && !!document.querySelector('.chatbot-mode-image')",
      ),
    "image model switch",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.chatbot-input-container').firstElementChild.className",
    ),
    "chatbot-mode-image",
  );
  checks++;
  await click(".chatbot-command-toggle");
  await click('.chatbot-command-menu button[title="문서 및 수정"]');
  await wait(
    () =>
      evaluate(
        "!document.querySelector('select[data-chatbot-model]') && !!document.querySelector('.chatbot-mode-file') && document.querySelector('.chatbot-mode-file').textContent.includes('문서 생성')",
      ),
    "file model switch",
  );
  checks++;
  for (const format of ["docx", "pptx", "pdf", "mermaid"]) {
    const before = await evaluate(
      "document.querySelectorAll('.chatbot-artifact').length",
    );
    await evaluate(
      `(()=>{const select=document.querySelector('select[aria-label="문서 형식"]');select.value=${JSON.stringify(format)};select.dispatchEvent(new Event('change',{bubbles:true}));const input=document.querySelector('.chatbot-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'형식별 브라우저 문서 작성');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await evaluate(
      "document.querySelector('.chatbot-composer').requestSubmit()",
    );
    await wait(
      () =>
        evaluate(
          `document.querySelectorAll('.chatbot-artifact').length>${before}`,
        ),
      `${format} actual document`,
      120000,
    );
    const download = await evaluate(
      "(async()=>{const a=Array.from(document.querySelectorAll('.chatbot-artifact')).at(-1).querySelector('a');const r=await fetch(a.href);const b=new Uint8Array(await r.arrayBuffer());return {status:r.status,type:r.headers.get('content-type'),prefix:Array.from(b.slice(0,5))};})()",
    );
    assert.equal(download.status, 200);
    if (format === "pdf")
      assert.deepEqual(download.prefix, [37, 80, 68, 70, 45]);
    else if (format === "mermaid")
      assert.equal(download.type, "text/vnd.mermaid; charset=utf-8");
    else assert.deepEqual(download.prefix.slice(0, 4), [80, 75, 3, 4]);
    checks++;
    await evaluate(
      "Array.from(document.querySelectorAll('.chatbot-artifact')).at(-1).querySelector('details').open=true",
    );
    await wait(
      () =>
        evaluate(
          format === "mermaid"
            ? "!!Array.from(document.querySelectorAll('.chatbot-artifact')).at(-1).querySelector('.chatbot-mermaid-canvas svg')"
            : "!!Array.from(document.querySelectorAll('.chatbot-artifact')).at(-1).querySelector('.chatbot-document-preview table')",
        ),
      `${format} document preview`,
      120000,
    );
    checks++;
  }
  await screenshot("document-formats");
  const color = await evaluate(
    "getComputedStyle(document.querySelector('.chatbot-popup')).backgroundColor",
  );
  await evaluate("document.documentElement.dataset.theme='dark'");
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.chatbot-popup')).backgroundColor",
    ),
    color,
  );
  checks++;
  await click('button[aria-label="챗봇 설정"]');
  await click('.chatbot-swatches button[aria-label="blue"]');
  assert.equal(
    await evaluate(
      "document.querySelector('.chatbot-root').dataset.chatbotTheme",
    ),
    "blue",
  );
  await evaluate(
    "[...document.querySelectorAll('.chatbot-settings button')].find(e=>e.textContent==='취소').click()",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.chatbot-root').dataset.chatbotTheme",
    ),
    "orange",
  );
  checks++;
  await click('button[aria-label="챗봇 설정"]');
  await click('.chatbot-swatches button[aria-label="forest"]');
  await evaluate(
    "[...document.querySelectorAll('.chatbot-settings button')].find(e=>e.textContent==='저장').click()",
  );
  await wait(
    () => evaluate("!document.querySelector('.chatbot-settings')"),
    "theme save",
  );
  assert.equal(
    (
      await fixture.db.execute(
        "SELECT settings_json FROM chatbot_user_settings",
      )
    ).rows[0].settings_json.includes("forest"),
    true,
  );
  checks++;
  await screenshot("independent-theme-and-modes");
  await click('button[aria-label="챗봇 닫기"]');
  const scenario = await evaluate(
    `(async()=>{const r=await fetch('/api/builder/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Chatbot browser scenario',nodes:[{id:'start',type:'message',position:{x:50,y:50},data:{content:'자동 실행 메시지'}}],edges:[],startNodeId:'start'})});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d.scenario;})()`,
  );
  const roomsBefore = (
    await fixture.db.execute("SELECT COUNT(*) AS n FROM chatbot_conversations")
  ).rows[0].n;
  await navigate("/react-flow/scenario-flow?scenarioId=" + scenario.id);
  await wait(
    () => evaluate("!!document.querySelector('.react-flow__node')"),
    "flow builder",
  );
  await evaluate(
    "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/simulator|시뮬레이터/i.test(x.title));if(!b)throw Error('simulator missing');b.click();})()",
  );
  await wait(
    () =>
      evaluate(
        "document.querySelector('.chatbot-messages')?.textContent.includes('자동 실행 메시지')",
      ),
    "automatic flow simulation",
  );
  assert.equal(
    await evaluate("!!document.querySelector('.chatbot-history')"),
    false,
  );
  assert.equal(
    (
      await fixture.db.execute(
        "SELECT COUNT(*) AS n FROM chatbot_conversations",
      )
    ).rows[0].n,
    roomsBefore,
  );
  checks += 2;
  await screenshot("flow-simulation");
  await click('button[aria-label="챗봇 닫기"]');
  await navigate("/react-flow/scenario-view?scenarioId=" + scenario.id);
  await wait(
    () => evaluate("!!document.querySelector('.react-flow__node')"),
    "view builder",
  );
  await evaluate(
    "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/simulator|시뮬레이터/i.test(x.title));if(!b)throw Error('simulator missing');b.click();})()",
  );
  await wait(
    () =>
      evaluate(
        "document.querySelector('.chatbot-messages')?.textContent.includes('자동 실행 메시지')",
      ),
    "automatic view simulation",
  );
  checks++;
  assert.ok(
    (
      await fixture.db.execute(
        "SELECT COUNT(*) AS n FROM chatbot_scenario_runs WHERE source='builder-simulation'",
      )
    ).rows[0].n >= 2,
  );
  checks++;
  await click('button[aria-label="챗봇 닫기"]');
  const interactiveGraph = {
    name: "Interactive chatbot scenario",
    nodes: [
      {
        id: "name",
        type: "slotfilling",
        position: { x: 50, y: 50 },
        data: { content: "이름을 입력하세요", slot: "name" },
      },
      {
        id: "form",
        type: "form",
        position: { x: 250, y: 50 },
        data: {
          elements: [
            {
              id: "choice",
              type: "dropbox",
              label: "선택",
              required: true,
              options: ["A", "B"],
            },
          ],
        },
      },
      {
        id: "done",
        type: "message",
        position: { x: 450, y: 50 },
        data: { content: "Hello {{name}} / {{choice}}" },
      },
    ],
    edges: [
      { id: "nf", source: "name", target: "form" },
      { id: "fd", source: "form", target: "done" },
    ],
    startNodeId: "name",
  };
  const interactive = await evaluate(
    `(async()=>{const r=await fetch('/api/builder/scenarios',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(interactiveGraph)})});const d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d.scenario;})()`,
  );
  await navigate("/react-flow/scenario-flow?scenarioId=" + interactive.id);
  await wait(
    () => evaluate("document.querySelectorAll('.react-flow__node').length===3"),
    "interactive graph",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(x=>/simulator|시뮬레이터/i.test(x.title)).click()",
  );
  await wait(
    () => evaluate("!!document.querySelector('.chatbot-scenario-input input')"),
    "slot input",
  );
  await evaluate(
    "(()=>{const e=document.querySelector('.chatbot-scenario-input input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Ada');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await evaluate(
    "document.querySelector('.chatbot-scenario-input').requestSubmit()",
  );
  await wait(
    () =>
      evaluate("!!document.querySelector('.chatbot-scenario-input select')"),
    "scenario form",
  );
  checks++;
  await evaluate(
    "(()=>{const e=document.querySelector('.chatbot-scenario-input select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'B');e.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await evaluate(
    "document.querySelector('.chatbot-scenario-input').requestSubmit()",
  );
  await wait(
    () =>
      evaluate(
        "document.querySelector('.chatbot-messages')?.textContent.includes('Hello Ada / B')",
      ),
    "form result",
  );
  checks++;
  assert.equal(
    await evaluate("!!document.querySelector('.chatbot-history')"),
    false,
  );
  checks++;
  await screenshot("interactive-simulation");
  await call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const bounds = await evaluate(
    "(()=>{const b=document.querySelector('.chatbot-popup').getBoundingClientRect();return {left:b.left,right:b.right,bottom:b.bottom};})()",
  );
  assert.ok(
    bounds.left >= 0 && bounds.right <= 390 && bounds.bottom <= 844,
    JSON.stringify(bounds),
  );
  checks++;
  await screenshot("simulation-mobile");
  assert.deepEqual(errors, []);
  checks++;
  await writeFile(
    join(artifacts, "result.json"),
    JSON.stringify({ checks, passed: true }),
  );
  console.log(
    `Chatbot browser: ${checks} checks passed (Chrome, synthetic DB, mock provider).`,
  );
} finally {
  socket?.close();
  stop(browser);
  stop(worker);
  stop(server);
  await new Promise((resolve) => objectServer.close(resolve));
  await writeFile("tsconfig.json", originalConfig);
  await writeFile(join(artifacts, "server.log"), logs);
  fixture.db.close();
}
