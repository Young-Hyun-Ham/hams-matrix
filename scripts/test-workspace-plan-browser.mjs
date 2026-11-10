// Real UI and APIs using a synthetic DB, isolated session and headless Chrome.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
const folder = await mkdtemp(join(tmpdir(), "matrix-workspace-plan-browser-"));
const db = createClient({ url: pathToFileURL(join(folder, "test.db")).href });
const origin = "http://localhost:3290";
let server,
  browser,
  socket,
  sessionId,
  serial = 0,
  logs = "";
const pending = new Map(),
  errors = [];
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitFor(test, label) {
  for (let i = 0; i < 600; i++) {
    try {
      if (await test()) return;
    } catch {
      /* Navigation and compilation. */
    }
    await pause(200);
  }
  throw new Error(`Timed out: ${label}\n${logs.slice(-5000)}`);
}
function call(method, params = {}, attached = true) {
  return new Promise((done, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 45000);
    pending.set(id, {
      done: (result) => {
        clearTimeout(timer);
        done(result);
      },
      reject,
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
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text,
    );
  return result.result.value;
}
async function click(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await pause(300);
}
async function navigate(path) {
  await call("Page.navigate", { url: origin + path });
}
async function screenshot(name) {
  const result = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    join(folder, `${name}.png`),
    Buffer.from(result.data, "base64"),
  );
}
function stop(child) {
  if (!child?.pid) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  else child.kill();
}
const openMismatch =
  "!!document.querySelector('dialog[open] #workspace-plan-title')";
try {
  for (const name of (await readdir("db/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.executeMultiple(
      await readFile(join("db/migrations", name), "utf8"),
    );
  await db.executeMultiple(`
    INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('owner','Policy Owner','user',1);
    UPDATE user_subscriptions SET plan_code='pro' WHERE user_id='owner';
    INSERT INTO workspaces(id,name,owner_id) VALUES ('original','Original Team workspace','owner');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('original','owner','owner');
    UPDATE users SET active_workspace_id='original' WHERE id='owner';
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','original','Synthetic project','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('p','original','owner','admin');
    UPDATE user_subscriptions SET plan_code='free' WHERE user_id='owner';
  `);
  await db.execute({
    sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES ('session',?,'owner','original',?,?)",
    args: [
      createHash("sha256").update("browser-policy-session").digest("hex"),
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
    ],
  });
  server = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "dev", "--port", "3290"],
    {
      windowsHide: true,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: pathToFileURL(join(folder, "test.db")).href,
        TURSO_AUTH_TOKEN: "",
        APP_URL: origin,
        OPENAI_API_KEY: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (data) => {
    logs += data;
  });
  server.stderr.on("data", (data) => {
    logs += data;
  });
  await waitFor(
    async () => (await fetch(origin + "/login")).ok,
    "Next development server",
  );
  browser = spawn(
    process.env.MATRIX_TEST_BROWSER ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${join(folder, "profile")}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  let port;
  await waitFor(async () => {
    port = (
      await readFile(join(folder, "profile", "DevToolsActivePort"), "utf8")
    ).split("\n");
    return port[1];
  }, "Chrome");
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((done, reject) => {
    socket.onopen = done;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data),
      item = pending.get(message.id);
    if (item) {
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.done(message.result);
    } else if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
  };
  const { targetId } = await call(
    "Target.createTarget",
    { url: "about:blank" },
    false,
  );
  ({ sessionId } = await call(
    "Target.attachToTarget",
    { targetId, flatten: true },
    false,
  ));
  await call("Network.enable");
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.setCookie", {
    name: "hams_session",
    value: "browser-policy-session",
    url: origin,
    httpOnly: true,
  });
  await navigate("/dashboard");
  await waitFor(() => evaluate(openMismatch), "initial mismatch modal");
  await screenshot("initial-mismatch");
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open]').textContent.includes('Pro') && document.querySelector('dialog[open]').textContent.includes('Free')",
    ),
    true,
  );
  await call("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await pause(200);
  assert.equal(
    await evaluate(openMismatch),
    true,
    `Escape cannot dismiss the policy gate: ${JSON.stringify(await evaluate("({path:location.pathname,dialogs:[...document.querySelectorAll('dialog')].map(e=>({open:e.open,title:e.getAttribute('aria-labelledby')}))})"))}`,
  );
  await screenshot("mismatch-modal");
  await click("dialog[open] button");
  await waitFor(
    () =>
      evaluate(
        "location.pathname==='/settings/subscription' && !!document.querySelector('input[name=subscription-plan]') && !document.querySelector('dialog[open]')",
      ),
    "subscription recovery page",
  );
  assert.equal(
    await evaluate(
      "document.body.textContent.includes('워크스페이스 플랜은 변경되지 않습니다.')",
    ),
    true,
  );
  await evaluate(
    "[...document.querySelectorAll('article')].find(e=>e.querySelector('h2')?.textContent==='Pro').querySelector('input').click()",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(e=>e.textContent==='요금제 선택 진행').click()",
  );
  await click("dialog[open] button.primary");
  await waitFor(
    () =>
      evaluate(
        "!![...document.querySelectorAll('span')].find(e=>e.textContent==='Pro 이용 중')",
      ),
    "matching subscription after change",
  );
  await navigate("/dashboard");
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('h1') && !document.querySelector('dialog[open]')",
      ),
    "unblocked dashboard",
  );
  assert.equal(
    (await db.execute("SELECT plan FROM workspaces WHERE id='original'"))
      .rows[0].plan,
    "pro",
  );
  // A policy mismatch introduced while the page is open must be caught by the
  // actual rejected API response, without waiting for the periodic refresh.
  assert.equal(
    await evaluate(
      `(async()=>{const {plans}=await(await fetch('/api/me/subscription')).json();const p=plans.find(p=>p.code==='free');const changed=await fetch('/api/me/subscription',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:'free',currentPlan:'pro',planVersion:p.version})});if(!changed.ok)return changed.status;return(await fetch('/api/projects')).status})()`,
    ),
    409,
  );
  await waitFor(() => evaluate(openMismatch), "live API rejection modal");
  await click("dialog[open] button");
  await waitFor(
    () =>
      evaluate(
        "location.pathname==='/settings/subscription' && !document.querySelector('dialog[open]')",
      ),
    "recovery remains reachable",
  );
  await evaluate(
    "(()=>{const e=document.querySelector('.workspace-picker select');e.value='';e.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await evaluate(
    "(()=>{const e=document.querySelector('dialog[open] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'New Pro workspace');e.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await waitFor(
    () =>
      evaluate(
        "!document.querySelector('dialog[open] button[type=submit]').disabled",
      ),
    "workspace name input",
  );
  await click("dialog[open] button[type=submit]");
  await waitFor(
    () =>
      evaluate(
        "location.pathname==='/dashboard' && !!document.querySelector('.workspace-picker select') && !document.querySelector('dialog[open]')",
      ),
    "new Pro workspace",
  );
  const created = (
    await db.execute(
      "SELECT plan,subscription_plan FROM workspaces WHERE name='New Pro workspace'",
    )
  ).rows[0];
  assert.equal(created.plan, "free");
  assert.equal(created.subscription_plan, "free");
  assert.equal(
    (await db.execute("SELECT plan FROM workspaces WHERE id='original'"))
      .rows[0].plan,
    "pro",
  );
  await evaluate(
    "(()=>{const e=document.querySelector('.workspace-picker select');e.value='original';e.dispatchEvent(new Event('change',{bubbles:true}))})()",
  );
  await waitFor(
    () => evaluate(openMismatch),
    "switch back to fixed Team workspace",
  );
  await screenshot("workspace-switch-mismatch");
  for (const path of [
    "/planning-board?projectId=p",
    "/projects/p/database/erd",
    "/projects/p/documents/synthetic-file",
  ]) {
    await navigate(path);
    await waitFor(
      () => evaluate(openMismatch),
      `standalone editor gate: ${path}`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS: initial/live mismatch modal, Escape blocking, recovery navigation and plan change, restored dashboard, creation-time plan, frozen old workspace, workspace switching and standalone editor gates. Evidence: ${folder}`,
  );
} finally {
  socket?.close();
  stop(browser);
  stop(server);
  db.close();
}
