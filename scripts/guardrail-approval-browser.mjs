import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function guardrailApprovalBrowser(fixture, approvalId) {
  const origin = "http://localhost:3291";
  const approval = (
    await fixture.db.execute({
      sql: "SELECT conv_id FROM ai_guardrail_approvals WHERE id=?",
      args: [approvalId],
    })
  ).rows[0];
  await fixture.db.execute({
    sql: "UPDATE ai_conversations SET title=? WHERE conv_id=?",
    args: ["브라우저 승인 요청", approval.conv_id],
  });
  let server,
    browser,
    socket,
    log = "",
    sequence = 0,
    dialogs = 0;
  const pending = new Map();
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, label, timeout = 45000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      try {
        const value = await fn();
        if (value) return value;
      } catch {}
      await pause(150);
    }
    throw Error(`Timed out: ${label}\n${log.slice(-2500)}`);
  }
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  async function evaluate(expression, sessionId) {
    const result = await call(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      sessionId,
    );
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  }
  const clickText = (text) =>
    evaluate(
      `(()=>{const label=${JSON.stringify(text)};const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===label||(e.closest('nav')&&e.textContent.trim().startsWith(label))); if(!b) throw Error('button missing: '+label); b.click();})()`,
    );
  const stop = (child) => {
    if (!child?.pid) return;
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill("SIGTERM");
  };
  try {
    server = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(resolve("scripts/guardrail-browser-provider.mjs")).href,
        resolve("node_modules/next/dist/bin/next"),
        "start",
        "--port",
        "3291",
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          TURSO_DATABASE_URL: fixture.url,
          TURSO_AUTH_TOKEN: "",
          APP_URL: origin,
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.on("data", (d) => {
      log += d;
    });
    server.stderr.on("data", (d) => {
      log += d;
    });
    await waitFor(
      async () => (await fetch(origin + "/login")).ok,
      "Next start",
    );
    const profile = join(fixture.folder, "guardrail-browser");
    browser = spawn(
      process.env.MATRIX_TEST_BROWSER ||
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    const ports = await waitFor(
      async () =>
        (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
          "\n",
        ),
      "Chrome debugging port",
    );
    const targets = await (
      await fetch(`http://localhost:${ports[0]}/json/list`)
    ).json();
    socket = new WebSocket(
      targets.find((t) => t.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Page.javascriptDialogOpening") {
        dialogs++;
        void call("Page.handleJavaScriptDialog", { accept: false });
      }
      const item = pending.get(message.id);
      if (item) {
        pending.delete(message.id);
        if (message.error) item.reject(message.error);
        else item.resolve(message.result);
      }
    };
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Network.enable");
    await call("Network.setCookie", {
      name: "hams_session",
      value: "guardrail-admin-session",
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    });
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await call("Page.navigate", {
      url: `${origin}/admin/guardrail-control-tower?workspaceId=dash-ws&entryProjectId=guardrail-entry&approvalId=${approvalId}`,
    });
    await waitFor(
      () =>
        evaluate(
          "document.body.innerText.includes('승인 요청 상세·처리') && document.body.innerText.includes('사용자가 요청한 작업') && !!document.querySelector('#approval-comment')",
        ),
      "approval detail hydration",
    );
    assert.ok(
      await evaluate(
        "document.body.innerText.includes('새 요구사항을 등록해 주세요.') && document.body.innerText.includes('차단출력') && document.body.innerText.includes('사용자 지정 차단 문구')",
      ),
    );
    assert.equal(
      await evaluate("!!document.querySelector('.workspace-sidebar')"),
      false,
      "independent window has no global sidebar",
    );
    await clickText("목록으로");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.guardrail-tower-list .guardrail-request-link')",
        ),
      "queue loaded",
    );
    await evaluate(
      "(()=>{const e=document.querySelector('.guardrail-tower-filters input[maxlength=\"100\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'Dashboard');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.guardrail-tower-filters input[maxlength=\"100\"]').value==='Dashboard'",
        ),
      "requester filter edit",
    );
    await clickText("검색");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.guardrail-tower-list .guardrail-request-link')",
        ),
      "filtered queue",
    );
    await evaluate(
      "document.querySelector('.guardrail-tower-list .guardrail-request-link').click()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.guardrail-request-preview')?.innerText.includes('상세 검토')",
        ),
      "selected row preview",
    );
    assert.equal(
      await evaluate("!!document.querySelector('#approval-comment')"),
      false,
      "preview does not expose a decision form",
    );
    await clickText("상세 검토");
    await waitFor(
      () => evaluate("!!document.querySelector('#approval-comment')"),
      "preview opens existing decision detail",
    );
    await evaluate("history.back()");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.guardrail-tower-list') && document.querySelector('.guardrail-tower-filters input[maxlength=\"100\"]').value==='Dashboard'",
        ),
      "back restores requester filter",
    );
    await evaluate("history.forward()");
    await waitFor(
      () => evaluate("!!document.querySelector('#approval-comment')"),
      "forward restores selected detail",
    );
    await evaluate(
      "(()=>{const e=document.querySelector('#approval-comment');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'요청 내용과 차단 근거를 확인했습니다.');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
    );
    await waitFor(
      () =>
        evaluate(
          "[...document.querySelectorAll('button')].some(e=>e.textContent==='이 요청 승인'&&!e.disabled)",
        ),
      "comment accepted",
    );
    await clickText("관제 대시보드");
    await waitFor(
      () => Promise.resolve(dialogs > 0),
      "dirty opinion navigation protection",
    );
    assert.ok(
      await evaluate(
        "!!document.querySelector('#approval-comment') && document.querySelector('#approval-comment').value.includes('확인했습니다')",
      ),
    );
    // Two real pages share the authenticated preference API, never storage payloads.
    const target = await call("Target.createTarget", {
      url: origin + "/settings?tab=interface",
    });
    const attached = await call("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    await call("Runtime.enable", {}, attached.sessionId);
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.theme-toggle') && !document.querySelector('.theme-toggle').disabled",
          attached.sessionId,
        ),
      "second window theme",
    );
    const firstTheme = await evaluate("document.documentElement.dataset.theme");
    await evaluate("document.querySelector('.theme-toggle').click()");
    await waitFor(
      () =>
        evaluate(
          `document.documentElement.dataset.theme !== ${JSON.stringify(firstTheme)}`,
          attached.sessionId,
        ),
      "theme propagated to main screen",
    );
    await waitFor(
      () =>
        evaluate(
          "!document.querySelector('.theme-toggle').disabled",
          attached.sessionId,
        ),
      "second theme ready",
    );
    await evaluate(
      "document.querySelector('.theme-toggle').click()",
      attached.sessionId,
    );
    await waitFor(
      () =>
        evaluate(
          `document.documentElement.dataset.theme === ${JSON.stringify(firstTheme)}`,
        ),
      "theme propagated back to tower",
    );
    assert.ok(
      await evaluate(
        "document.querySelector('#approval-comment').value.includes('확인했습니다')",
      ),
    );
    await call("Target.closeTarget", { targetId: target.targetId });
    await clickText("이 요청 승인");
    assert.ok(
      await evaluate(
        "document.body.innerText.includes('사용자가 ‘이어서 진행’을 눌러야')",
      ),
    );
    await clickText("승인 확정");
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.guardrail-approval-detail')?.innerText.includes('승인됨 · 사용자 재개 대기') && !document.querySelector('#approval-comment')",
        ),
      "approved state",
    );
    await call("Emulation.setDeviceMetricsOverride", {
      width: 760,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.equal(
      await evaluate("!!document.querySelector('.guardrail-tower-list')"),
      false,
    );
    await clickText("목록으로");
    assert.notEqual(
      await evaluate(
        "getComputedStyle(document.querySelector('.guardrail-tower-list')).display",
      ),
      "none",
    );
    await clickText("관제 대시보드");
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.tower-metrics')?.innerText.includes('오늘 검사')",
        ),
      "real dashboard overview",
    );
    assert.ok(
      await evaluate(
        "document.body.innerText.includes('정책 테스트 포함') && !!document.querySelector('.theme-toggle')",
      ),
    );
    for (const width of [1440, 1280, 1024, 768, 390]) {
      await call("Emulation.setDeviceMetricsOverride", {
        width,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const theme of ["light", "dark"]) {
        await evaluate(
          `document.documentElement.dataset.theme=${JSON.stringify(theme)}`,
        );
        assert.ok(
          await evaluate(
            "document.documentElement.scrollWidth <= window.innerWidth + 1",
          ),
          `no page overflow ${width}/${theme}`,
        );
        assert.ok(
          await evaluate(
            "(()=>{const r=document.querySelector('.theme-toggle').getBoundingClientRect();return r.right<=innerWidth&&r.left>=0&&r.top<100})()",
          ),
          `header theme visible ${width}/${theme}`,
        );
      }
    }
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await evaluate("document.documentElement.dataset.theme='light'");
    const screenshot = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(
      join(fixture.folder, "guardrail-overview.png"),
      Buffer.from(screenshot.data, "base64"),
    );
    await clickText("승인 대기열");
    await evaluate("history.back()");
    await waitFor(
      () => evaluate("!!document.querySelector('.tower-metrics')"),
      "history restores dashboard",
    );
    console.log(
      `guardrail overview screenshot: ${join(fixture.folder, "guardrail-overview.png")}`,
    );
    await call("Network.setCookie", {
      name: "hams_session",
      value: "dash-owner-session",
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    });
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await call("Page.navigate", {
      url: `${origin}/projects/dash-p1?tab=requirement`,
    });
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('[aria-controls=matrix-ai-conversations]')",
        ),
      "user project screen",
    );
    await waitFor(
      () =>
        evaluate(
          "(()=>{const e=document.querySelector('[aria-controls=matrix-ai-conversations]');if(e&&e.getAttribute('aria-expanded')!=='true')e.click();return !!document.querySelector('.matrix-ai-project-toggle')})()",
        ),
      "chat menu",
    );
    await evaluate(
      "(()=>{const e=document.querySelector('.matrix-ai-project-toggle');if(e.getAttribute('aria-expanded')!=='true')e.click();})()",
    );
    await waitFor(
      () =>
        evaluate(
          "[...document.querySelectorAll('.matrix-ai-room-title')].some(e=>e.textContent==='브라우저 승인 요청')",
        ),
      "original conversation",
    );
    await evaluate(
      "[...document.querySelectorAll('.matrix-ai-room-title')].find(e=>e.textContent==='브라우저 승인 요청').closest('button').click()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.matrix-ai-guardrail')?.innerText.includes('관리자가 승인했습니다.')",
        ),
      "user approved waiting card",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('textarea[aria-label=\"AI 요청 내용\"]').disabled",
      ),
      false,
    );
    assert.ok(
      await evaluate(
        "!!document.querySelector('.matrix-ai-messages .matrix-ai-guardrail') && !document.querySelector('.matrix-ai-card .matrix-ai-guardrail')",
      ),
    );
    await evaluate(
      "(()=>{const e=document.querySelector('textarea[aria-label=\"AI 요청 내용\"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'작성 중인 다음 질문');e.dispatchEvent(new Event('input',{bubbles:true}));})()",
    );
    await evaluate(
      "(async()=>{const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').fillRect(0,0,2,2);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const d=new DataTransfer();d.items.add(new File([blob],'next-draft.png',{type:'image/png'}));document.querySelector('textarea[aria-label=\"AI 요청 내용\"]').dispatchEvent(new ClipboardEvent('paste',{clipboardData:d,bubbles:true}));})()",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelectorAll('.matrix-ai-attachments img').length===1",
        ),
      "draft image attached before resume",
    );
    await clickText("이어서 진행");
    await waitFor(
      () => evaluate("!!document.querySelector('.matrix-ai-result-actions')"),
      "explicit user resume",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('textarea[aria-label=\"AI 요청 내용\"]').value",
      ),
      "작성 중인 다음 질문",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.matrix-ai-attachments img').length",
      ),
      1,
      "resume preserves the next draft image",
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.matrix-ai-turn').length"),
      1,
    );
    const geometry = await evaluate(
      "(()=>{const e=document.querySelector('.matrix-ai-result-actions');const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();const btn=e.querySelector('button');return {gap:Math.abs(a.right-b.right),height:btn.getBoundingClientRect().height,font:getComputedStyle(btn).fontSize}})()",
    );
    assert.ok(geometry.gap < 2, "result actions align to the right edge");
    assert.equal(geometry.font, "11px");
    assert.ok(geometry.height < 34, "compact chat buttons");
    const hitlGeometry = await evaluate(
      "(()=>{const e=document.querySelector('.matrix-ai-hitl-actions');const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return {gap:Math.abs(a.left-b.left),buttons:e.querySelectorAll('button').length,font:getComputedStyle(e.querySelector('button')).fontSize}})()",
    );
    assert.ok(hitlGeometry.gap < 2, "HITL actions align to the left edge");
    assert.equal(hitlGeometry.buttons, 3);
    assert.equal(hitlGeometry.font, geometry.font);
    for (const theme of ["light", "dark"]) {
      await evaluate(`document.documentElement.dataset.theme='${theme}'`);
      await call("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: false,
      });
      assert.ok(
        await evaluate(
          "(()=>{const e=document.querySelector('.matrix-ai-messages');return e.scrollWidth<=e.clientWidth+2})()",
        ),
        "no horizontal overflow in narrow chat",
      );
    }
    assert.equal(
      (
        await fixture.db.execute({
          sql: "SELECT status FROM ai_guardrail_approvals WHERE id=?",
          args: [approvalId],
        })
      ).rows[0].status,
      "completed",
    );
    await call("Network.setCookie", {
      name: "hams_session",
      value: "dash-outsider-session",
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    });
    await call("Page.navigate", {
      url: `${origin}/admin/guardrail-control-tower?workspaceId=dash-ws&entryProjectId=guardrail-entry&approvalId=${approvalId}`,
    });
    await waitFor(
      () =>
        evaluate(
          "document.body.innerText.includes('관리 가능한 워크스페이스를 확인할 수 없습니다.')",
        ),
      "unauthorized screen",
    );
    assert.equal(
      await evaluate("document.body.innerText.includes('차단출력')"),
      false,
    );
    console.log(
      "guardrail browser: admin confirmation, in-message approval, editable draft text/image preserved on resume, one original turn, left HITL/right compact result actions, narrow light/dark layout and unauthorized access passed",
    );
  } finally {
    socket?.close();
    stop(browser);
    stop(server);
  }
}
