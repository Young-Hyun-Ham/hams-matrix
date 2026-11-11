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
const db = createClient({
  url: pathToFileURL(join(folder, "test.db")).href,
  timeout: 5000,
});
const origin = "http://localhost:3291";
const production = process.argv.includes("--production");
const testDistDir = production
  ? ".next"
  : `.next/browser-products-${folder.split(/[\\/]/).pop()}`;
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
  await db.execute("PRAGMA journal_mode=WAL");
  await db.execute("PRAGMA busy_timeout=5000");
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
    [
      resolve("node_modules/next/dist/bin/next"),
      production ? "start" : "dev",
      "--port",
      "3291",
    ],
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
    await waitFor(
      () =>
        evaluate(
          "(()=>{const e=document.querySelector('.workspace-picker select');return e && Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k].onChange==='function')})()",
        ),
      "workspace selector hydrated",
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
    await db.executeMultiple(
      `INSERT OR IGNORE INTO project_members(project_id,workspace_id,user_id,role) VALUES ('master-a','master-ws','master','admin'); INSERT INTO audit_logs(id,occurred_at,request_id,workspace_id,actor_id,actor_name,actor_type,action,resource_type,outcome,source,http_method,route,before_json,after_json) VALUES ('history-modal','2099-01-01T00:00:00.000Z','history-modal','master-ws','master','HistoryModalActor','user','UPDATE','test','success','web','PATCH','/test','{"label":"before-modal"}','{"label":"after-modal"}');`,
    );
    await navigate("/admin/settings?tab=history");
    await waitFor(
      () => evaluate("!!document.querySelector('tbody')"),
      "master workspace history",
    );
    await waitFor(
      () =>
        evaluate(
          '!!document.querySelector(\'[aria-label="이력 작업자 검색어"]\') && !!document.querySelector(\'[aria-label="프로젝트 필터"] option[value="master-a"]\')',
        ),
      "history filters loaded",
    );
    await waitFor(
      () =>
        evaluate(
          "(()=>{const e=document.querySelector('[aria-label=\"이력 작업자 검색어\"]');return e && Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k].onChange==='function')})()",
        ),
      "history search hydrated",
    );
    await evaluate(
      `(()=>{const input=document.querySelector('[aria-label="이력 작업자 검색어"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'HistoryModalActor');input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await evaluate(
      "document.querySelector('[aria-label=\"이력 작업자 검색어\"]').form.requestSubmit()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelectorAll('tbody tr').length===1 && document.querySelector('tbody').textContent.includes('HistoryModalActor')",
        ),
      "history name filter",
    );
    await evaluate(
      "(()=>{const select=document.querySelector('[aria-label=\"프로젝트 필터\"]');select.value='master-a';select.dispatchEvent(new Event('change',{bubbles:true}));})()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('tbody')?.textContent.includes('HistoryModalActor')",
        ),
      "history project filter",
    );
    await click("tbody button");
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('dialog[open] .admin-detail-body')?.textContent.includes('before-modal') && document.querySelector('dialog[open] .admin-detail-body')?.textContent.includes('after-modal')",
        ),
      "history detail modal",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('dialog[open]').classList.contains('admin-detail-dialog')",
      ),
      true,
    );
    await screenshot("history-detail-modal");
    await click("dialog[open] .admin-detail-close");
    assert.equal(
      await evaluate("!!document.querySelector('dialog[open]')"),
      false,
    );
    await click("tbody button");
    await waitFor(
      () => evaluate("!!document.querySelector('dialog[open]')"),
      "history reopen",
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
      () => evaluate("!document.querySelector('dialog[open]')"),
      "history Escape close",
    );
    await navigate("/admin/settings?tab=system");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.system-settings-form input[type=number]') && !document.querySelector('.system-settings-form button[type=submit]')?.disabled",
        ),
      "workspace system settings form",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.system-settings-form').textContent.includes('Master personal')",
      ),
      true,
    );
    await evaluate(
      `(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;const numbers=document.querySelectorAll('.system-settings-form input[type=number]');set.call(numbers[0],'120');numbers[0].dispatchEvent(new Event('input',{bubbles:true}));set.call(numbers[1],'1');numbers[1].dispatchEvent(new Event('input',{bubbles:true}));const message=document.querySelector('[aria-label="403 오류 메시지"]');set.call(message,'관리자가 지정한 권한 안내');message.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await evaluate(
      "document.querySelector('.system-settings-form').requestSubmit()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.system-settings-form [role=status]')?.textContent.includes('저장했습니다.')",
        ),
      "workspace system settings saved",
    );
    const savedSettings = await evaluate(
      "(async()=>await(await fetch('/api/me/system-settings')).json())()",
    );
    assert.equal(savedSettings.staleTimeMs, 120000);
    assert.equal(savedSettings.retryCount, 1);
    assert.equal(
      savedSettings.errorMessages["403"],
      "관리자가 지정한 권한 안내",
    );
    await screenshot("workspace-system-settings");
    await evaluate(
      "[...document.querySelectorAll('.system-settings-form button')].find(x=>x.textContent==='기본값 불러오기').click()",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.system-settings-form input[type=number]').value",
      ),
      "60",
    );
    assert.equal(
      await evaluate(
        "(async()=>(await(await fetch('/api/me/system-settings')).json()).staleTimeMs)()",
      ),
      120000,
    );
    await evaluate(
      "[...document.querySelectorAll('.system-settings-form button')].find(x=>x.textContent==='최신 설정 다시 불러오기').click()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.system-settings-form input[type=number]').value==='120'",
        ),
      "discard settings draft and reload saved version",
    );
    await db.executeMultiple(
      `UPDATE plans SET team_sharing_enabled=1 WHERE code='free'; INSERT INTO team_join_requests(id,workspace_id,user_id,status,requested_at) VALUES ('header-team','master-ws','user','pending','2026-11-11T00:00:00.000Z'); INSERT INTO business_requests(id,user_id,company_name,contact) VALUES ('header-contract','user','Header company','synthetic'); INSERT INTO notifications(id,recipient_user_id,type,business_request_id) VALUES ('header-notice','master','business_request','header-contract');`,
    );
    await navigate("/settings?tab=account");
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('[aria-label=\"Business 계약 알림\"] .notification-badge')?.textContent==='1' && document.querySelector('[aria-label=\"알림\"] .notification-badge')?.textContent==='1'",
        ),
      "both header counter badges",
    );
    await evaluate(
      "(()=>{window.__headerOriginalFetch=window.fetch;window.__headerCalls=[];window.fetch=(input,init)=>{window.__headerCalls.push(String(input));return window.__headerOriginalFetch(input,init);};})()",
    );
    await pause(16000);
    const headerCalls = await evaluate("window.__headerCalls");
    assert.ok(headerCalls.includes("/api/super-admin/notifications/count"));
    assert.ok(headerCalls.includes("/api/me/notifications/count"));
    assert.equal(
      headerCalls.filter(
        (path) =>
          path === "/api/super-admin/notifications" ||
          path === "/api/team/requests",
      ).length,
      0,
      "closed panels poll counters only",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('[aria-label=\"Business 계약 알림\"] .notification-badge')).backgroundColor",
      ),
      "rgb(220, 38, 38)",
    );
    assert.equal(
      await evaluate(
        "(()=>{const a=document.querySelector('[aria-label=\"Business 계약 알림\"]').getBoundingClientRect(),b=document.querySelector('[aria-label=\"Business 계약 알림\"] .notification-badge').getBoundingClientRect();return b.top>=0&&b.left>a.left+a.width/2&&b.top<a.top+a.height/2})()",
      ),
      true,
    );
    await screenshot("header-counter-badges");
    await click('[aria-label="Business 계약 알림"]');
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('#contract-notifications-panel')?.textContent.includes('Header company')",
        ),
      "contract list on open",
    );
    assert.equal(
      (await evaluate("window.__headerCalls")).filter(
        (path) => path === "/api/super-admin/notifications",
      ).length,
      1,
    );
    await evaluate(
      "document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))",
    );
    await waitFor(
      () =>
        evaluate("!document.querySelector('#contract-notifications-panel')"),
      "contract outside dismissal",
    );
    await click('[aria-label="알림"]');
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('#team-notifications-panel')?.textContent.includes('Personal user')",
        ),
      "team list on open",
    );
    assert.equal(
      (await evaluate("window.__headerCalls")).filter(
        (path) => path === "/api/team/requests",
      ).length,
      1,
    );
    await evaluate(
      "document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))",
    );
    await waitFor(
      () => evaluate("!document.querySelector('#team-notifications-panel')"),
      "team outside dismissal",
    );
    await click('[aria-label="Business 계약 알림"]');
    await waitFor(
      () =>
        evaluate(
          "window.__headerCalls.filter(path=>path==='/api/super-admin/notifications').length===2",
        ),
      "fresh contract list on reopen",
    );
    await click("#contract-notifications-panel a");
    await waitFor(
      async () =>
        !!(
          await db.execute(
            "SELECT read_at FROM notifications WHERE id='header-notice'",
          )
        ).rows[0].read_at,
      "contract read persisted",
    );
    await waitFor(
      () =>
        evaluate(
          "!document.querySelector('[aria-label=\"Business 계약 알림\"] .notification-badge')",
        ),
      "read updates exact counter",
    );
    await evaluate("window.fetch=window.__headerOriginalFetch");
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
    await navigate("/settings?tab=account");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('form.settings-form input[name=name]')",
        ),
      "account error policy test",
    );
    await waitFor(
      () =>
        evaluate(
          "(()=>{const e=document.querySelector('form.settings-form');return e&&Object.keys(e).some(k=>k.startsWith('__reactProps$')&&typeof e[k].onSubmit==='function')})()",
        ),
      "account form hydrated",
    );
    const userPolicy = await evaluate(
      "(async()=>await(await fetch('/api/me/system-settings')).json())()",
    );
    await evaluate(
      `(()=>{window.__matrixOriginalFetch=window.fetch;window.__matrixPatchCalls=0;window.fetch=async(input,init)=>{if(input==='/api/me'&&init?.method==='PATCH'){window.__matrixPatchCalls++;return Response.json({error:'DO NOT DISPLAY RAW ERROR'},{status:403});}return window.__matrixOriginalFetch(input,init);};document.querySelector('form.settings-form').requestSubmit();})()`,
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('form.settings-form [role=alert]')?.textContent.includes('이 작업을 수행할 권한이 없습니다.')",
        ),
      "default workspace HTTP wording",
    );
    const messages = {
      ...userPolicy.errorMessages,
      403: "변경된 공간 권한 안내",
    };
    await db.execute({
      sql: "INSERT INTO workspace_system_settings(workspace_id,stale_time_ms,retry_count,error_messages_json,version,updated_by,created_at,updated_at) VALUES ('user-ws',60000,3,?,1,'user',?,?) ON CONFLICT(workspace_id) DO UPDATE SET error_messages_json=excluded.error_messages_json,version=workspace_system_settings.version+1",
      args: [
        JSON.stringify(messages),
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    });
    await evaluate(
      "(()=>{const channel=new BroadcastChannel('matrix-system-settings:user-ws');channel.postMessage({version:1});channel.close();})()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('form.settings-form [role=alert]')?.textContent.includes('변경된 공간 권한 안내')",
        ),
      "existing error re-resolves on workspace policy change",
    );
    assert.equal(
      await evaluate("window.__matrixPatchCalls"),
      1,
      "Saving wording must not replay a failed mutation",
    );
    assert.equal(
      await evaluate(
        "document.body.textContent.includes('DO NOT DISPLAY RAW ERROR')",
      ),
      false,
    );
    await evaluate("window.fetch=window.__matrixOriginalFetch");
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
  for (const path of production
    ? []
    : [`${testDistDir}/types/**/*.ts`, `${testDistDir}/dev/types/**/*.ts`]) {
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
