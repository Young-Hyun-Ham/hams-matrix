// Real UI and APIs using a synthetic DB, isolated session and headless Chrome.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
const folder = await mkdtemp(join(tmpdir(), "matrix-product-browser-"));
const db = createClient({ url: pathToFileURL(join(folder, "test.db")).href });
const origin = "http://localhost:3291";
const testDistDir = `.next/browser-products-${folder.split(/[\\/]/).pop()}`;
const originalTypeConfig = await readFile("tsconfig.json", "utf8");
let server,
  browser,
  socket,
  sessionId,
  serial = 0,
  logs = "";
let trackSubscription = false;
const subscriptionRequests = [];
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
    INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('master','Super','master',1),('biz','Company admin','biz_admin',1),('user','Personal user','user',1);
    INSERT INTO plan_products(id,product_code,name,plan_code,created_by) VALUES ('company','biz-a','Company A','business','master');
    INSERT INTO contracts(id,product_id,starts_at,created_by) VALUES ('contract','company','2026-01-01T00:00:00.000Z','master');
    INSERT INTO product_members(product_id,user_id,role,granted_by) VALUES ('company','biz','admin','master');
    UPDATE user_subscriptions SET plan_code='business',product_id='company' WHERE user_id='biz';
    INSERT INTO workspaces(id,name,owner_id) VALUES ('master-ws','Master personal','master'),('biz-ws','Company space','biz'),('user-ws','User personal','user');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('master-ws','master','owner'),('biz-ws','biz','owner'),('user-ws','user','owner');
    UPDATE users SET active_workspace_id=id||'-ws';
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('master-a','master-ws','Master A','master','master'),('master-b','master-ws','Master B','master','master');
    INSERT INTO ai_token_usage(id,workspace_id,user_id,project_id,project_name,conv_id,conversation_title,chat_id,request_id,call_index,model,prompt_characters,created_at) VALUES
      ('usage-a','master-ws','master','master-a','Master A','architecture-mermaid','Architecture A','a','req-a',0,'test-model',0,'2026-11-09T00:00:00.000Z'),
      ('usage-b','master-ws','master','master-b','Master B','architecture-mermaid','Architecture B','b','req-b',0,'test-model',0,'2026-11-09T00:00:00.000Z');
  `);
  for (const id of ["master", "biz", "user"])
    await db.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
      args: [
        id,
        createHash("sha256")
          .update(id + "-browser")
          .digest("hex"),
        id,
        id + "-ws",
        new Date().toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
      ],
    });
  server = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "dev", "--port", "3291"],
    {
      windowsHide: true,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: pathToFileURL(join(folder, "test.db")).href,
        TURSO_AUTH_TOKEN: "",
        APP_URL: origin,
        OPENAI_API_KEY: "",
        NEXT_TELEMETRY_DISABLED: "1",
        MATRIX_TEST_DIST_DIR: testDistDir,
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
    } else if (
      message.method === "Network.requestWillBeSent" &&
      trackSubscription
    ) {
      const request = message.params.request;
      const path = new URL(request.url).pathname;
      if (path.startsWith("/api/me/"))
        subscriptionRequests.push({ path, method: request.method });
    } else if (
      message.method === "Runtime.consoleAPICalled" &&
      message.params.type === "error" &&
      message.params.args.some((arg) => String(arg.value).includes("same key"))
    )
      errors.push(JSON.stringify(message.params.args));
    else if (message.method === "Runtime.exceptionThrown")
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
  async function login(id) {
    await call("Network.setCookie", {
      name: "hams_session",
      value: id + "-browser",
      url: origin,
      httpOnly: true,
    });
  }
  await login("master");
  trackSubscription = true;
  await navigate("/settings/subscription");
  await waitFor(
    () =>
      evaluate(
        "(()=>{const e=document.querySelector('input[name=subscription-plan]');return !!e && Object.keys(e).some(k=>k.startsWith('__reactProps$') && typeof e[k].onChange==='function')})()",
      ),
    "master subscription hydrated",
  );
  assert.equal(
    await evaluate(
      "document.body.textContent.includes('승인·결제 없이 선택한 요금제가 즉시 적용됩니다.')",
    ),
    true,
  );
  async function selectMasterPlan(name) {
    await evaluate(
      `(()=>{const card=[...document.querySelectorAll('article')].find(e=>e.querySelector('h2')?.textContent===${JSON.stringify(name)});card.querySelector('input[name=subscription-plan]').click()})()`,
    );
    await waitFor(
      () =>
        evaluate(
          "[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='요금제 선택 진행' && !e.disabled)",
        ),
      "selected master plan",
    );
    await evaluate(
      "[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='요금제 선택 진행').click()",
    );
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('dialog[open] #subscription-confirm-title')",
        ),
      "master confirmation",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('dialog[open] input, dialog[open] textarea')===null",
      ),
      true,
    );
    assert.equal(
      await evaluate(
        "document.querySelector('dialog[open] .project-registration-footer .primary').textContent.trim()",
      ),
      "즉시 변경",
    );
  }
  for (const [code, name] of [
    ["team", "Team"],
    ["business", "Business"],
    ["pro", "Pro"],
    ["free", "Free"],
  ]) {
    await selectMasterPlan(name);
    await evaluate(
      "(()=>{const b=document.querySelector('dialog[open] .project-registration-footer .primary');b.click();b.click()})()",
    );
    await waitFor(
      async () =>
        (
          await db.execute(
            "SELECT plan_code FROM user_subscriptions WHERE user_id='master'",
          )
        ).rows[0].plan_code === code,
      `master ${code} applied`,
    );
    await waitFor(
      () =>
        evaluate(
          `document.querySelector('h1')?.parentElement.textContent.includes(${JSON.stringify(name + " 이용 중")}) && !document.querySelector('dialog[open] #subscription-confirm-title')`,
        ),
      `master ${code} refreshed`,
    );
    assert.equal(
      (await db.execute("SELECT account_role FROM users WHERE id='master'"))
        .rows[0].account_role,
      "master",
    );
    if (code === "team")
      assert.equal(
        await evaluate(
          "document.body.textContent.includes('갱신은 아래에서 진행') || document.body.textContent.includes('Team 결제 갱신')",
        ),
        false,
      );
  }
  await selectMasterPlan("Team");
  await db.execute("UPDATE plans SET version=version+1 WHERE code='team'");
  await click("dialog[open] .project-registration-footer .primary");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open] [role=alert]')?.textContent.includes('새로고침')",
      ),
    "stale plan error",
  );
  assert.equal(
    (
      await db.execute(
        "SELECT plan_code FROM user_subscriptions WHERE user_id='master'",
      )
    ).rows[0].plan_code,
    "free",
  );
  await click("dialog[open] .admin-detail-close");
  trackSubscription = false;
  assert.equal(
    subscriptionRequests.filter(
      (r) => r.path === "/api/me/subscription" && r.method === "PATCH",
    ).length,
    5,
  );
  assert.deepEqual(
    subscriptionRequests.filter(
      (r) =>
        r.path === "/api/me/business-requests" ||
        r.path === "/api/me/payments/team/orders",
    ),
    [],
  );
  for (const table of [
    "payment_orders",
    "payment_events",
    "business_requests",
    "notifications",
  ])
    assert.equal(
      (await db.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0].n,
      0,
    );
  await navigate("/settings/subscription");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('h1')?.parentElement.textContent.includes('Free 이용 중')",
      ),
    "master plan persists after reload",
  );
  await navigate("/super-admin/settings?tab=business");
  await waitFor(
    () => evaluate("!!document.querySelector('input[name=name]')"),
    "Business console",
  );
  assert.equal(
    await evaluate(
      "!!document.querySelector('a[href=\"/super-admin/settings\"]')",
    ),
    true,
  );
  assert.equal(
    await evaluate("!!document.querySelector('a[href=\"/admin/settings\"]')"),
    true,
  );
  await screenshot("super-business");
  await navigate("/super-admin/settings?tab=plans");
  await waitFor(
    () => evaluate("!!document.querySelector('h1')"),
    "super plans",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelectorAll('input[name=projectInviteLimit]').length===4",
      ),
    "invite limit options",
  );
  await waitFor(
    () =>
      evaluate(
        "(()=>{const f=document.querySelector('input[name=projectInviteLimit]').form;return Object.keys(f).some(k=>k.startsWith('__reactProps$') && typeof f[k].onSubmit==='function')})()",
      ),
    "plan form hydrated",
  );
  assert.deepEqual(
    await evaluate(
      "[...document.querySelectorAll('input[name=projectInviteLimit]')].map(e=>e.value)",
    ),
    ["1", "1", "20", ""],
  );
  await evaluate(
    "(()=>{const e=document.querySelector('input[name=projectInviteLimit]');e.value='2';e.form.requestSubmit()})()",
  );
  await waitFor(
    async () =>
      Number(
        (
          await db.execute(
            "SELECT project_invite_limit FROM plans WHERE code='free'",
          )
        ).rows[0].project_invite_limit,
      ) === 2,
    "save invite limit UI",
  );
  await navigate("/super-admin/settings?tab=plans");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('input[name=projectInviteLimit]')?.value==='2'",
      ),
    "persisted invite limit",
  );
  if (process.argv.includes("--plans-only"))
    console.log(
      "PASS: browser invite defaults, master plan form save and persisted reload",
    );
  else {
    await navigate("/settings?tab=usage");
    await waitFor(
      () =>
        evaluate(
          "document.querySelectorAll('select[aria-label=\"사용량 채팅방\"] option').length===3",
        ),
      "shared conversation IDs rendered",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('select[aria-label=\"워크스페이스 선택\"] option')[0].value",
      ),
      "",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.workspace-picker > button').length",
      ),
      0,
    );
    await evaluate(
      "(()=>{const e=document.querySelector('.workspace-picker select');e.value='';e.dispatchEvent(new Event('change',{bubbles:true}))})()",
    );
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('dialog[open] #workspace-create-title')",
        ),
      "create action inside selector",
    );
    await evaluate("document.querySelector('dialog[open]').close()");
    assert.equal(await evaluate("location.pathname"), "/settings");
    await screenshot("usage-unique-keys");
    await navigate("/admin/settings");
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('tbody')?.textContent.includes('Super')",
        ),
      "master workspace members",
    );
    assert.equal(
      await evaluate(
        "(async()=>{const r=await fetch('/api/admin/products/workspace');const d=await r.json();return d.projects.length})()",
      ),
      2,
    );
    assert.equal(
      await evaluate(
        "(async()=> (await fetch('/api/admin/products/workspace/members?projectId=foreign')).status)()",
      ),
      404,
    );
    assert.equal(
      await evaluate(
        "(async()=> (await fetch('/api/admin/ai-guardrails?workspaceId=biz-ws')).status)()",
      ),
      403,
    );
    await navigate("/admin/settings?tab=guardrails");
    await waitFor(
      () => evaluate("!!document.querySelector('.guardrail-heading')"),
      "master own guardrails",
    );
    assert.equal(
      await evaluate(
        "(async()=> (await fetch('/api/admin/ai-guardrails?workspaceId=master-ws')).status)()",
      ),
      200,
    );
    assert.equal(
      await evaluate(
        `(async()=>{const endpoint='/api/admin/ai-guardrails?workspaceId=master-ws';const d=await(await fetch(endpoint)).json();return(await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'draft',policy:d.draft,revision:d.revision,activeVersion:d.active.version})})).status})()`,
      ),
      200,
    );
    await navigate("/admin/settings?tab=history");
    await waitFor(
      () => evaluate("!!document.querySelector('tbody')"),
      "master workspace history",
    );
    await login("biz");
    await navigate("/admin/settings");
    await waitFor(
      () => evaluate("document.body.textContent.includes('Company A')"),
      "product member console",
    );
    assert.equal(
      await evaluate(
        "!!document.querySelector('a[href=\"/super-admin/settings\"]')",
      ),
      false,
    );
    assert.equal(
      await evaluate(
        "(async()=> (await fetch('/api/super-admin/business/products')).status)()",
      ),
      403,
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('tbody')?.textContent.includes('Company admin')",
        ),
      "scoped member list loaded",
    );
    assert.equal(
      await evaluate("!!document.querySelector('[role=alert]')"),
      false,
    );
    await screenshot("business-admin");
    await navigate("/admin/settings?tab=guardrails");
    await waitFor(
      () => evaluate("!!document.querySelector('h1')"),
      "guardrail screen",
    );
    await login("user");
    await navigate("/settings/subscription");
    await waitFor(
      () =>
        evaluate(
          "document.body.textContent.includes('Team') && !!document.querySelector('input[name=subscription-plan]')",
        ),
      "personal plans",
    );
    assert.equal(
      await evaluate(
        "(async()=> (await fetch('/api/admin/products/members')).status)()",
      ),
      403,
    );
    assert.equal(
      await evaluate(
        "(async()=> (await fetch('/api/me/payments/team/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({billingCycle:'monthly'})})).status)()",
      ),
      503,
    );
    assert.equal(
      (await db.execute("SELECT account_role FROM users WHERE id='user'"))
        .rows[0].account_role,
      "user",
    );
    await screenshot("payment-unconfigured");
    await navigate("/super-admin/settings");
    await waitFor(
      () => evaluate("location.pathname==='/dashboard'"),
      "ordinary user redirect",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS: master immediate Team/Business/Pro/Free UI, PATCH-only routing, no payment/request queries, double-click prevention, stale error and reload persistence; unique shared conversation keys without console errors, create action first in selector, master workspace members/projects/guardrail draft/history, isolated customer scopes, three menus and unconfigured payment. Evidence: ${folder}`,
    );
  }
} finally {
  socket?.close();
  stop(browser);
  stop(server);
  db.close();
  // Next generates type references in the shared source tree; remove only this test's paths.
  const config = await readFile("tsconfig.json", "utf8");
  let cleaned = config;
  for (const path of [
    `${testDistDir}/types/**/*.ts`,
    `${testDistDir}/dev/types/**/*.ts`,
  ]) {
    cleaned = cleaned
      .replace(`,\n    "${path}"`, "")
      .replace(`,\r\n    "${path}"`, "");
  }
  if (cleaned !== config)
    await writeFile(
      "tsconfig.json",
      JSON.stringify(JSON.parse(cleaned)) ===
        JSON.stringify(JSON.parse(originalTypeConfig))
        ? originalTypeConfig
        : cleaned,
    );
  const types = await readFile("next-env.d.ts", "utf8");
  if (types.includes(testDistDir))
    await writeFile("next-env.d.ts", types.replaceAll(testDistDir, ".next"));
}
