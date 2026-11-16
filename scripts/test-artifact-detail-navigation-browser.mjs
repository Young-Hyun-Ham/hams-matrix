// Production Next + real browser + isolated SQLite. No external AI requests.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const fixture = await dashboardFixture();

await fixture.db.execute({
  sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,detail_level,created_by,updated_by,created_at,updated_at) VALUES ('browser-function','dash-ws','dash-p1','function','FNC-001','Browser function','초안',?,'skeleton','dash-owner','dash-owner','2026-11-13','2026-11-13')",
  args: [
    JSON.stringify({ purpose: "Browser purpose", summary: "Browser summary" }),
  ],
});
await fixture.db.execute({
  sql: "INSERT INTO artifact_links(source_id,target_id,project_id,workspace_id) VALUES ('browser-function',?,'dash-p1','dash-ws')",
  args: [fixture.requirement.id],
});
await fixture.db.execute(
  "INSERT INTO project_source_snapshots(id,workspace_id,project_id,source_type,source_id,source_version,name,content_hash,content,created_by,created_at) VALUES ('browser-source','dash-ws','dash-p1','rfp','synthetic-rfp',1,'Synthetic RFP','hash','Immutable browser source','dash-owner','2026-11-13')",
);
await fixture.db.execute(
  "INSERT INTO artifact_source_references(artifact_id,snapshot_id,project_id,workspace_id,locator,excerpt,rationale,origin) VALUES ('browser-function','browser-source','dash-p1','dash-ws','Synthetic RFP','','Browser evidence','사용자 지정')",
);
for (const [id, code, title] of [
  ["browser-wbs-a", "WBS-901", "Browser WBS A"],
  ["browser-wbs-b", "WBS-902", "Browser WBS B"],
]) {
  await fixture.db.execute({
    sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,detail_level,created_by,updated_by,created_at,updated_at) VALUES (?,'dash-ws','dash-p1','wbs',?,?,'초안',?,'skeleton','dash-owner','dash-owner','2026-11-16','2026-11-16')",
    args: [
      id,
      code,
      title,
      JSON.stringify({
        taskType: "작업",
        startDate: "",
        endDate: "",
        progress: "0",
      }),
    ],
  });
}
const origin = "http://localhost:3287";
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
async function navigate(path, selector = ".matrix-section table") {
  await call("Network.setCookie", {
    name: "hams_session",
    value: "dash-owner-session",
    url: origin,
    httpOnly: true,
  });
  await call("Page.navigate", { url: origin + path });
  await waitFor(
    () => evaluate(`!!document.querySelector(${JSON.stringify(selector)})`),
    "project hydration",
  );
  await waitFor(
    () =>
      evaluate(
        'document.querySelector(".matrix-project-role")?.textContent.includes("owner")',
      ),
    "project access",
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
    [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3287"],
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

  await navigate("/projects/dash-p1?tab=function");
  assert.ok(
    await evaluate(
      "(()=>{const tabs=[...document.querySelectorAll('.matrix-tabs button')].map(e=>e.textContent);return tabs.indexOf('기능명세서')+1===tabs.indexOf('프로그램 정의')})()",
    ),
  );
  await click(".matrix-section tbody .text-button");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open]')?.textContent.includes('Browser purpose')",
      ),
    "function detail",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('dialog[open] button')].find(e=>e.title==='이전 문서').disabled",
    ),
    true,
  );
  await evaluate(
    "[...document.querySelectorAll('dialog[open] .text-button')].find(e=>e.textContent.includes('DASH-REQ')).click()",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open] h2')?.textContent.includes('DASH-REQ')",
      ),
    "linked requirement",
  );
  await click('dialog[open] button[aria-label="이전 문서"]');
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open] h2')?.textContent.includes('FNC-001')",
      ),
    "back function",
  );
  await evaluate(
    "[...document.querySelectorAll('dialog[open] .text-button')].find(e=>e.textContent==='Synthetic RFP').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open]')?.textContent.includes('Immutable browser source')",
      ),
    "source snapshot",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('dialog[open] button')].find(e=>e.title==='다음 문서').disabled",
    ),
    true,
  );
  await click('dialog[open] button[aria-label="이전 문서"]');
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open] h2')?.textContent.includes('FNC-001')",
      ),
    "back from source",
  );
  await click('dialog[open] button[aria-label="다음 문서"]');
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open]')?.textContent.includes('Immutable browser source')",
      ),
    "forward source",
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
    "Escape",
  );
  await resize(390);
  await click(".matrix-section tbody .text-button");
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open]')?.textContent.includes('Browser purpose')",
      ),
    "mobile detail",
  );

  await evaluate(
    "[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent==='수정').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('dialog[open] textarea[name=summary]')",
      ),
    "common editor",
  );
  await evaluate(
    "(()=>{const e=document.querySelector('dialog[open] textarea[name=summary]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Revised browser summary');e.dispatchEvent(new Event('input',{bubbles:true}))})()",
  );
  await click('dialog[open] button[data-level="skeleton"]');
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open]')?.textContent.includes('Revised browser summary') && !document.querySelector('dialog[open] textarea[name=summary]')",
      ),
    "progressive skeleton save",
  );
  const evidence = resolve(".auth-tests/deliverable-navigation");
  await mkdir(evidence, { recursive: true });
  await writeFile(
    join(evidence, "mobile-detail.png"),
    Buffer.from(
      (await call("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  await navigate("/projects/dash-p1?tab=documents", ".matrix-project-role");
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('button')].some(e=>e.textContent==='연계 문서 일괄 생성')",
      ),
    "generation entry",
  );
  await evaluate(
    "[...document.querySelectorAll('button')].find(e=>e.textContent==='연계 문서 일괄 생성').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open]')?.textContent.includes('저장된 RFP가 없습니다')",
      ),
    "file-only source guidance",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] input[type=checkbox]').disabled",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] input[type=checkbox]').checked",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent==='생성하여 초안 저장').disabled",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('dialog[open] label')].find(e=>e.textContent.includes('제안요청서 초안도 함께 생성')).querySelector('input').checked",
    ),
    true,
  );
  // The modal discovers a persisted job without relying on sessionStorage.
  await fixture.db.execute({
    sql: "INSERT INTO project_deliverable_generation_requests(request_id,workspace_id,project_id,user_id,input_json,status,payload_json,created_at,updated_at) VALUES (?,'dash-ws','dash-p1','dash-owner','{}','running',?, ?, ?)",
    args: [
      "12345678-1234-4123-8123-123456789abc",
      JSON.stringify({
        sources: [],
        versions: [],
        maxChanges: 3,
        evidenceWarnings: [
          {
            clientRef: "@derived",
            message: "Synthetic evidence: 전체 원문을 출처로 연결했습니다.",
          },
        ],
      }),
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  });
  await navigate("/projects/dash-p1?tab=documents", ".matrix-project-role");
  await evaluate(
    "[...document.querySelectorAll('button')].find(e=>e.textContent==='연계 문서 일괄 생성').click()",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open] [role=status]')?.textContent.includes('생성 중')",
      ),
    "persisted job recovery after navigation",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open]').textContent.includes('생성 근거 검토 필요: 1건')",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "sessionStorage.getItem('matrix-deliverables:dash-owner:dash-ws:dash-p1')",
    ),
    null,
  );
  const browserRfp = {
    schemaVersion: 1,
    projectId: "dash-p1",
    title: "Browser generated RFP",
    basic: {
      organization: "",
      startDate: "",
      endDate: "",
      budget: "",
      background: "From business plan",
      objectives: "",
    },
    scope: {
      currentState: "",
      targetUsers: "",
      included: "Scope",
      excluded: "",
      expectedEffects: "",
    },
    requirements: [],
    delivery: {
      schedule: [],
      organization: "",
      quality: "",
      security: "",
      risks: "",
      support: "",
    },
    proposalGuide: {
      documents: "",
      method: "",
      deadline: "",
      contact: "",
      outline: "",
    },
    evaluation: [],
    appendix: {
      glossary: "",
      references: "Synthetic business plan",
      notes: "",
    },
  };
  await fixture.db.execute({
    sql: "INSERT INTO project_rfp_documents(id,project_id,workspace_id,document_json,created_by,updated_by,created_at,updated_at) VALUES ('browser-rfp','dash-p1','dash-ws',?,'dash-owner','dash-owner',?,?)",
    args: [
      JSON.stringify(browserRfp),
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  });
  const completionPayload = JSON.parse(
    (
      await fixture.db.execute(
        "SELECT payload_json FROM project_deliverable_generation_requests WHERE request_id='12345678-1234-4123-8123-123456789abc'",
      )
    ).rows[0].payload_json,
  );
  completionPayload.rfpResult = {
    id: "browser-rfp",
    version: 1,
    title: "Browser generated RFP",
    snapshotId: "browser-source",
  };
  await fixture.db.execute({
    sql: "UPDATE project_deliverable_generation_requests SET status='completed',result_json='[]',payload_json=? WHERE request_id='12345678-1234-4123-8123-123456789abc'",
    args: [JSON.stringify(completionPayload)],
  });
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open] [role=status]')?.textContent.includes('초안 저장 완료')",
      ),
    "automatic background completion polling",
  );
  await evaluate(
    "[...document.querySelectorAll('dialog[open] button')].find(e=>e.textContent.includes('생성된 제안요청서 보기')).click()",
  );
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('#rfp-title')?.value==='Browser generated RFP'",
      ),
    "generated RFP navigation and editor refresh",
  );
  await navigate("/projects/dash-p1?tab=wbs", ".matrix-project-role");
  const openWbs = async (code) => {
    await waitFor(
      () =>
        evaluate(
          "[...document.querySelectorAll('section .text-button')].some(e=>e.textContent.includes('" +
            code +
            "'))",
        ),
      "WBS list " + code,
    );
    await evaluate(
      "[...document.querySelectorAll('section .text-button')].find(e=>e.textContent.includes('" +
        code +
        "')).click()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('dialog[open] h2')?.textContent.includes('" +
            code +
            "')",
        ),
      "WBS detail " + code,
    );
  };
  await openWbs("WBS-901");
  assert.equal(
    await evaluate(
      "(()=>{const h=document.querySelector('dialog[open] .artifact-detail-header');const a=h.querySelector('.artifact-detail-actions');const buttons=[...a.querySelectorAll('button')];return buttons[0].textContent.trim()==='수정'&&buttons[1].textContent.trim()==='닫기'&&a.getBoundingClientRect().left>=h.querySelector('h2').getBoundingClientRect().right-1})()",
    ),
    true,
    "edit stays immediately left of close on the right",
  );
  await click("dialog[open] .admin-detail-close");
  await openWbs("WBS-902");
  assert.equal(
    await evaluate(
      "document.querySelector('dialog[open] button[aria-label=\"이전 문서\"]').disabled",
    ),
    false,
  );
  await click('dialog[open] button[aria-label="이전 문서"]');
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open] h2')?.textContent.includes('WBS-901')",
      ),
    "WBS previous after reopen",
  );
  await click('dialog[open] button[aria-label="다음 문서"]');
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('dialog[open] h2')?.textContent.includes('WBS-902')",
      ),
    "WBS forward after reopen",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: function tab order, detail, linked source, back/forward branch, Escape, mobile detail, skeleton save, persisted generation recovery, completion polling, WBS header placement and close/reopen navigation. Evidence: " +
      evidence,
  );
} catch (failure) {
  if (socket?.readyState === WebSocket.OPEN && sessionId) {
    const evidence = resolve(".auth-tests/deliverable-navigation");
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
