// Production Next + real browser + isolated SQLite. No external AI requests.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const fixture = await dashboardFixture();
const origin = "http://localhost:3286";
let server,
  browser,
  socket,
  sessionId,
  serial = 0,
  logs = "";
const pending = new Map(),
  errors = [];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitFor(fn, label) {
  for (let i = 0; i < 250; i++) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {}
    await pause(100);
  }
  throw Error(`Timed out: ${label}`);
}
function call(method, params = {}, attached = true) {
  return new Promise((res, rej) => {
    const id = ++serial;
    const timeout = setTimeout(() => {
      pending.delete(id);
      rej(Error(`CDP timeout ${method}`));
    }, 25000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timeout);
        res(v);
      },
      reject: rej,
    });
    socket.send(
      JSON.stringify({
        id,
        method,
        params,
        ...(attached && sessionId ? { sessionId } : {}),
      }),
    );
  });
}
async function evaluate(expression) {
  const value = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (value.exceptionDetails)
    throw Error(
      value.exceptionDetails.exception?.description ??
        value.exceptionDetails.text,
    );
  return value.result.value;
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
}
async function resize(width) {
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await pause(200);
}
async function navigate(path = "/dashboard", user = "dash-owner") {
  await call("Network.setCookie", {
    name: "hams_session",
    value: `${user}-session`,
    url: origin,
    httpOnly: true,
  });
  await call("Page.navigate", { url: origin + path });
  await waitFor(
    () =>
      evaluate(
        '!!document.querySelector(".matrix-dashboard") && !document.querySelector(".theme-toggle")?.disabled',
      ),
    "dashboard hydration",
  );
  await waitFor(
    () =>
      evaluate(
        'document.querySelector(".matrix-dashboard").getAttribute("aria-busy")==="false"',
      ),
    "dashboard data",
  );
}
async function selectProject(id) {
  await evaluate(
    `(()=>{const e=document.querySelector('[aria-label="대시보드 프로젝트 선택"]');e.value=${JSON.stringify(id)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await waitFor(
    () =>
      evaluate(
        `location.search==="${id ? "?projectId=" + id : ""}" && document.querySelectorAll('.dashboard-project').length===${id ? 1 : 2}`,
      ),
    "filtered project",
  );
}
function stop(child) {
  if (!child?.pid) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else child.kill("SIGTERM");
}
try {
  server = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3286"],
    {
      windowsHide: true,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: fixture.url,
        TURSO_AUTH_TOKEN: "",
        APP_URL: origin,
        OPENAI_API_KEY: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (d) => {
    logs += d;
  });
  server.stderr.on("data", (d) => {
    logs += d;
  });
  await waitFor(async () => (await fetch(origin + "/login")).ok, "Next server");
  browser = spawn(
    process.env.MATRIX_TEST_BROWSER ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${join(fixture.folder, "profile")}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  const port = await waitFor(
    async () =>
      (
        await readFile(
          join(fixture.folder, "profile", "DevToolsActivePort"),
          "utf8",
        )
      ).split("\n"),
    "Chrome",
  );
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((res, rej) => {
    socket.onopen = res;
    socket.onerror = rej;
  });
  socket.onmessage = (event) => {
    const m = JSON.parse(event.data);
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      if (m.error) p.reject(Error(m.error.message));
      else p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown")
      errors.push(
        m.params.exceptionDetails.exception?.description ??
          m.params.exceptionDetails.text,
      );
  };
  const targets = await call("Target.getTargets", {}, false);
  const target = targets.targetInfos.find((t) => t.type === "page");
  sessionId = (
    await call(
      "Target.attachToTarget",
      { targetId: target.targetId, flatten: true },
      false,
    )
  ).sessionId;
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await resize(1440);
  await navigate();
  await waitFor(
    () =>
      evaluate('document.querySelectorAll(".dashboard-project").length===2'),
    "project cards",
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".dashboard-stat").length'),
    4,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".dashboard-steps button").length',
    ),
    5,
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".dashboard-documents tbody tr").length',
    ),
    4,
  );
  assert.ok(
    await evaluate(
      'document.querySelector(".dashboard-impact").textContent.includes("DASH-REQ")',
    ),
  );
  assert.ok(
    await evaluate(
      '!document.querySelector(".matrix-dashboard").textContent.includes("Secret")',
    ),
  );
  await evaluate(
    `document.querySelectorAll('.dashboard-actions button')[1].click()`,
  );
  await waitFor(
    () =>
      evaluate(
        '!!document.querySelector(".dashboard-navigation-dialog[open]")',
      ),
    "explicit project chooser",
  );
  assert.equal(
    await evaluate(
      'document.querySelectorAll(".dashboard-navigation-options a").length',
    ),
    2,
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await call("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitFor(
    () => evaluate('!document.querySelector(".dashboard-navigation-dialog")'),
    "Escape closes chooser",
  );
  assert.equal(
    await evaluate("document.activeElement.textContent"),
    "RFP로 시작하기",
  );
  await selectProject("dash-p1");
  assert.ok(
    await evaluate(
      'document.querySelectorAll(".dashboard-documents tbody tr a").length>0',
    ),
  );
  assert.ok(
    (
      await evaluate(
        'Array.from(document.querySelectorAll(".dashboard-documents tbody tr a")).map(a=>a.getAttribute("href"))',
      )
    ).every((h) => h.startsWith("/projects/dash-p1?tab=")),
  );
  await selectProject("dash-p2");
  assert.ok(
    await evaluate(
      'document.querySelector(".dashboard-impact").textContent.includes("확인된 재검증 후보가 없습니다")',
    ),
  );
  await evaluate("history.back()");
  await waitFor(
    () =>
      evaluate(
        'location.search==="?projectId=dash-p1" && document.querySelector(".dashboard-impact").textContent.includes("DASH-REQ")',
      ),
    "back restores filter",
  );
  await call("Page.reload");
  await waitFor(
    () =>
      evaluate(
        'document.querySelectorAll(".dashboard-project").length===1 && document.querySelector(".dashboard-impact").textContent.includes("DASH-REQ")',
      ),
    "SSR filtered reload",
  );
  for (const width of [1440, 1024, 768, 390]) {
    await resize(width);
    assert.ok(
      await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),
      `page overflow at ${width}`,
    );
    assert.ok(
      await evaluate(
        'document.querySelector(".dashboard-table-wrap").scrollWidth>=document.querySelector(".dashboard-table-wrap").clientWidth',
      ),
    );
  }
  await resize(1440);
  await evaluate('document.documentElement.dataset.theme="dark"');
  const evidence = resolve(".auth-tests/dashboard");
  await mkdir(evidence, { recursive: true });
  await writeFile(
    join(evidence, "desktop-dark.png"),
    Buffer.from(
      (
        await call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        })
      ).data,
      "base64",
    ),
  );
  await resize(390);
  await writeFile(
    join(evidence, "mobile-dark.png"),
    Buffer.from(
      (
        await call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        })
      ).data,
      "base64",
    ),
  );
  await evaluate('document.documentElement.dataset.theme="light"');
  await resize(1440);
  await writeFile(
    join(evidence, "desktop-light.png"),
    Buffer.from(
      (
        await call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        })
      ).data,
      "base64",
    ),
  );
  // Open a real empty conversation to exercise the narrower dashboard container.
  // No message is submitted and no AI provider is invoked.
  await click('[aria-controls="matrix-ai-conversations"]');
  await waitFor(
    () => evaluate('!!document.querySelector(".matrix-ai-project-toggle")'),
    "AI menu",
  );
  await click(".matrix-ai-project-toggle");
  await waitFor(
    () =>
      evaluate(
        '!!document.querySelector(".matrix-ai-new-chat") && !document.querySelector(".matrix-ai-new-chat").disabled',
      ),
    "new conversation ready",
  );
  await click(".matrix-ai-new-chat");
  await waitFor(
    () =>
      evaluate(
        'document.querySelector(".workspace-content-layout").classList.contains("ai-is-open")',
      ),
    "AI panel open",
  );
  await pause(400);
  assert.ok(
    await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),
  );
  await click('[aria-label="AI 채팅 확대"]');
  await pause(400);
  assert.ok(
    await evaluate("document.documentElement.scrollWidth <= innerWidth+1"),
  );
  await writeFile(
    join(evidence, "desktop-ai-expanded.png"),
    Buffer.from(
      (
        await call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        })
      ).data,
      "base64",
    ),
  );
  await click('[aria-label="AI 채팅 닫기"]');
  // The active dashboard request fails without replacing the UI with a false empty state.
  await call("Network.setBlockedURLs", { urls: ["*/api/dashboard*"] });
  await evaluate(
    'window.history.pushState(null,"","/dashboard?projectId=dash-p1-network-error")',
  );
  await waitFor(
    () =>
      evaluate(
        'document.querySelector(".matrix-dashboard [role=alert]")?.textContent.includes("다시 불러오기")',
      ),
    "network error retry",
  );
  await call("Network.setBlockedURLs", { urls: [] });
  await navigate("/dashboard?projectId=dash-hidden");
  await waitFor(
    () =>
      evaluate(
        'document.querySelector(".matrix-dashboard [role=alert]")?.textContent.includes("프로젝트를 찾을 수 없습니다")',
      ),
    "inaccessible ID",
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".dashboard-project").length'),
    0,
  );
  await navigate("/dashboard", "dash-viewer");
  await waitFor(
    () =>
      evaluate('document.querySelectorAll(".dashboard-project").length===1'),
    "viewer assigned cards",
  );
  await navigate("/dashboard", "dash-empty");
  assert.ok(
    await evaluate(
      'document.querySelector(".matrix-dashboard").textContent.includes("참여 중인 프로젝트가 없습니다")',
    ),
  );
  await evaluate(
    'document.querySelectorAll(".dashboard-actions button")[1].click()',
  );
  await waitFor(
    () => evaluate('!!document.querySelector(".create-project-dialog[open]")'),
    "empty RFP creation dialog",
  );
  // Use native setters so React receives actual controlled-input changes.
  await evaluate(
    `(()=>{const input=document.querySelector('#project-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'대시보드 RFP 시작 검증');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await waitFor(
    () =>
      evaluate(
        '!document.querySelector(".create-project-dialog button[type=submit]").disabled',
      ),
    "create form ready",
  );
  await click(".create-project-dialog button[type=submit]");
  await waitFor(
    () =>
      evaluate(
        'location.pathname.startsWith("/projects/") && location.search==="?tab=rfp"',
      ),
    "RFP navigation after create",
  );
  assert.equal(
    Number(
      (
        await fixture.db.execute(
          "SELECT COUNT(*) AS n FROM projects WHERE name='대시보드 RFP 시작 검증'",
        )
      ).rows[0].n,
    ),
    1,
  );
  const cookie = { cookie: "hams_session=dash-owner-session" };
  const endpoint = origin + "/api/dashboard";
  assert.equal(
    (await fetch(endpoint, { method: "POST", headers: cookie })).status,
    405,
  );
  assert.equal(
    (await fetch(endpoint, { method: "HEAD", headers: cookie })).status,
    200,
  );
  assert.ok(
    (await fetch(endpoint, { method: "OPTIONS", headers: cookie })).headers
      .get("allow")
      .includes("GET"),
  );
  assert.deepEqual(errors, []);
  console.log(
    `PASS: real Next SSR/filter/back/reload, RFP chooser/Escape/focus, valid tab links, 4 viewports/light-dark screenshots, errors/invalid IDs, viewer/empty/create-to-RFP, 405/HEAD/OPTIONS. Evidence: ${evidence}`,
  );
} catch (failure) {
  if (socket?.readyState === WebSocket.OPEN && sessionId) {
    const evidence = resolve(".auth-tests/dashboard");
    await mkdir(evidence, { recursive: true });
    await writeFile(
      join(evidence, "failure.html"),
      await evaluate("document.documentElement.outerHTML"),
    );
    await writeFile(
      join(evidence, "failure.png"),
      Buffer.from(
        (await call("Page.captureScreenshot", { format: "png" })).data,
        "base64",
      ),
    );
    await writeFile(
      join(evidence, "browser-errors.json"),
      JSON.stringify(errors),
    );
  }
  throw failure;
} finally {
  await writeFile(join(fixture.folder, "server.log"), logs);
  socket?.close();
  stop(browser);
  stop(server);
  fixture.db.close();
}
