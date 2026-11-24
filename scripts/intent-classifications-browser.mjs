import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function intentClassificationsBrowser(fixture) {
  const origin = "http://localhost:3293";
  let server,
    browser,
    socket,
    serial = 0,
    logs = "";
  const pending = new Map(),
    requests = [];
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  async function resize(width) {
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await pause(150);
  }
  async function screenshot(name) {
    const folder = resolve(".auth-tests/intent-console");
    await mkdir(folder, { recursive: true });
    const shot = await call("Page.captureScreenshot", { format: "png" });
    await writeFile(
      join(folder, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  }
  async function waitFor(fn, label, timeout = 45000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      try {
        if (await fn()) return;
      } catch {}
      await pause(120);
    }
    throw Error("Timed out: " + label + "\n" + logs.slice(-1800));
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
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
    return r.result.value;
  }
  async function click(selector) {
    await evaluate(
      "document.querySelector(" +
        JSON.stringify(selector) +
        ").scrollIntoView({block:'center'})",
    );
    await pause(100);
    const rect = await evaluate(
      "(()=>{const e=document.querySelector(" +
        JSON.stringify(selector) +
        ");if(!e)throw Error('missing');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()",
    );
    await call("Input.dispatchMouseEvent", {
      type: "mousePressed",
      ...rect,
      button: "left",
      clickCount: 1,
    });
    await call("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      ...rect,
      button: "left",
      clickCount: 1,
    });
  }
  async function openRag(selector) {
    await waitFor(async () => {
      if (
        await evaluate("!!document.querySelector('.project-rag-dialog[open]')")
      )
        return true;
      await click(selector);
      return false;
    }, "RAG dialog after hydration");
  }
  const cookie = (value) =>
    call("Network.setCookie", {
      name: "hams_session",
      value,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    });
  const navigate = async (path) => {
    await call("Page.navigate", { url: origin + path });
  };
  try {
    server = spawn(
      process.execPath,
      [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3293"],
      {
        windowsHide: true,
        env: {
          ...process.env,
          TURSO_DATABASE_URL: fixture.url,
          TURSO_AUTH_TOKEN: "",
          APP_URL: origin,
          OPENAI_API_KEY: "synthetic-disabled",
          NEXT_TELEMETRY_DISABLED: "1",
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
    }, "Next server");
    const profile = join(fixture.folder, "intent-browser");
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
      port = (
        await readFile(join(profile, "DevToolsActivePort"), "utf8")
      ).split("\n")[0];
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
    socket.onmessage = (event) => {
      const m = JSON.parse(event.data);
      if (m.method === "Network.requestWillBeSent")
        requests.push(m.params.request.url);
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        if (m.error) p.reject(m.error);
        else p.resolve(m.result);
      }
    };
    await call("Page.enable");
    await call("Runtime.enable");
    await call("Network.enable");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cookie("dash-owner-session");
    await navigate("/projects/dash-p1/intent-classifications?view=failures");
    await waitFor(
      () =>
        evaluate(
          "document.querySelectorAll('.intent-table tbody tr').length===20 && document.body.innerText.includes('SYNTHETIC_FAILURE')",
        ),
      "failed vectorization history",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('nav a[aria-current=page]')?.textContent.trim()",
      ),
      "실패 이력",
    );
    assert.equal(
      await evaluate("!!document.querySelector('.intent-detail')"),
      false,
    );
    assert.equal(
      await evaluate("document.body.innerText.includes('reference-key')"),
      false,
    );
    await click(".intent-actions button:last-child");
    await waitFor(
      () =>
        evaluate(
          "document.querySelectorAll('.intent-table tbody tr').length===3 && location.search.includes('cursor=')",
        ),
      "failure pagination",
    );
    await resize(320);
    assert.equal(
      await evaluate("document.documentElement.scrollWidth <= innerWidth"),
      true,
    );
    await screenshot("failure-history-mobile");
    await resize(1440);
    await navigate(
      "/projects/dash-p1/intent-classifications?from=2026-11-23&to=2026-11-23&eventId=event-00",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelectorAll('.intent-table tbody tr').length===20 && document.querySelector('.intent-detail')?.innerText.includes('Saved requirement')",
        ),
      "classification list and detail",
    );
    assert.equal(
      await evaluate("!!document.querySelector('.workspace-sidebar')"),
      false,
    );
    assert.equal(
      await evaluate("document.body.innerText.includes('PRIVATE_FIELD')"),
      false,
    );
    await waitFor(
      () => evaluate("!document.querySelector('.theme-toggle')?.disabled"),
      "theme hydration",
    );
    const sourceLink =
      '.intent-detail a[href*="reference=1"][href*="referencePart=source"]';
    assert.equal(
      await evaluate(
        "document.querySelector('.intent-knowledge-list h4')?.textContent",
      ),
      "원본 삭제 또는 열람 불가",
    );
    assert.ok(
      await evaluate(
        "document.querySelector('.intent-knowledge-list')?.textContent.includes('Saved requirement') && document.querySelector('.intent-knowledge-list blockquote')?.textContent.includes('검색 당시 요구사항 본문')",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.intent-detail > details')?.open ?? document.querySelector('.intent-technical')?.open",
      ),
      false,
    );
    await screenshot("knowledge-desktop");
    await click(sourceLink);
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.intent-reference-dialog[open]')?.textContent.includes('검색 당시 요구사항 본문')",
        ),
      "reference source and saved chunk",
    );
    assert.ok(
      await evaluate(
        "document.querySelector('.intent-reference-dialog').textContent.includes('현재 원본의 버전이 다릅니다')",
      ),
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.intent-reference-dialog a').getAttribute('href')",
      ),
      "/projects/dash-p1?tab=requirement",
    );
    await click(".intent-reference-dialog header button");
    assert.ok(
      await evaluate(
        "!location.search.includes('reference=') && location.search.includes('eventId=event-00')",
      ),
    );
    await click(
      '.intent-detail a[href*="reference=1"][href*="referencePart=chunk"]',
    );
    await waitFor(
      () =>
        evaluate(
          "document.activeElement?.getAttribute('aria-label')==='검색 당시 청크'",
        ),
      "chunk link focuses indexed content",
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
      () =>
        evaluate("!document.querySelector('.intent-reference-dialog[open]')"),
      "reference closes with Escape",
    );
    // A deleted source has no clickable name; direct links still show the notice.
    await navigate(
      "/projects/dash-p1/intent-classifications?from=2026-11-23&to=2026-11-23&eventId=event-00&reference=0&referencePart=source",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.intent-reference-dialog[open]')?.textContent.includes('원본이 삭제되었거나')",
        ),
      "deleted source notice",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.intent-reference-dialog pre').length",
      ),
      0,
    );
    await click(".intent-reference-dialog header button");
    await navigate(
      "/projects/dash-p1/intent-classifications?from=2026-11-23&to=2026-11-23&eventId=event-00&reference=1&referencePart=chunk",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.intent-reference-dialog[open]')?.textContent.includes('검색 당시 요구사항 본문')",
        ),
      "reference deep link",
    );
    await resize(320);
    assert.ok(
      await evaluate(
        "document.documentElement.scrollWidth<=innerWidth+1 && document.querySelector('.intent-reference-dialog').scrollWidth<=document.querySelector('.intent-reference-dialog').clientWidth+1",
      ),
      "reference mobile overflow",
    );
    await click(".intent-reference-dialog header button");
    await resize(1440);
    await evaluate("window.scrollTo(0,0)");
    assert.equal(
      await evaluate("document.querySelectorAll('.intent-card').length"),
      2,
    );
    await evaluate(`(()=>{
      const e=document.querySelector('.intent-filters select');
      window.__intentFilter=e;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'rag');
      e.dispatchEvent(new Event('change',{bubbles:true}));
    })()`);
    for (const width of [1440, 1100, 1024, 768, 420, 360, 320]) {
      await resize(width);
      assert.ok(
        await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
        `intent overflow at ${width}`,
      );
      assert.ok(
        await evaluate(
          "window.__intentFilter===document.querySelector('.intent-filters select') && window.__intentFilter.value==='rag' && location.search.includes('eventId=event-00') && document.querySelector('.intent-detail').textContent.includes('FUTURE_REASON')",
        ),
        `draft/selection retained at ${width}`,
      );
      if (width <= 1100)
        assert.equal(
          await evaluate(
            "getComputedStyle(document.querySelector('.intent-columns')).gridTemplateColumns.split(' ').length",
          ),
          1,
        );
    }
    await resize(420);
    await click(".intent-menu-toggle");
    assert.equal(
      await evaluate(
        "document.querySelector('.intent-menu-toggle').getAttribute('aria-expanded')",
      ),
      "true",
    );
    assert.notEqual(
      await evaluate(
        "getComputedStyle(document.querySelector('#intent-navigation')).display",
      ),
      "none",
    );
    await screenshot("mobile-light");
    await click(".intent-menu-toggle");
    await resize(1440);
    await screenshot("desktop-light");
    await click(".theme-toggle");
    await waitFor(
      () =>
        evaluate(
          "document.documentElement.dataset.theme==='dark' && !document.querySelector('.theme-toggle').disabled",
        ),
      "intent dark theme",
    );
    assert.ok(
      await evaluate(
        "window.__intentFilter.value==='rag' && location.search.includes('eventId=event-00')",
      ),
    );
    await screenshot("desktop-dark");
    await click(".theme-toggle");
    await waitFor(
      () =>
        evaluate(
          "document.documentElement.dataset.theme==='light' && !document.querySelector('.theme-toggle').disabled",
        ),
      "intent light theme",
    );
    await call("Emulation.setDeviceMetricsOverride", {
      width: 420,
      height: 880,
      deviceScaleFactor: 1,
      mobile: false,
    });
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.intent-columns')).gridTemplateColumns.split(' ').length",
      ),
      1,
    );
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate("/projects/dash-p1?tab=overview");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.project-rag-actions > button') && !document.querySelector('.theme-toggle')?.disabled",
        ),
      "workbench",
    );
    await openRag(".project-rag-actions > button");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('dialog[open] [data-console-window]:not(:disabled)')",
        ),
      "owner modal action",
    );
    assert.ok(
      await evaluate(
        "document.querySelector('dialog footer').firstElementChild.classList.contains('console-window-entry')",
      ),
    );
    // Simulate a browser that gives no opener handle and suppresses the popup.
    await evaluate(
      "window.__launches=[];window.__realOpen=window.open;window.open=(url,target,features)=>{window.__launches.push({url,target,features});return null;}",
    );
    await click("dialog[open] [data-console-window]");
    await waitFor(
      () =>
        evaluate(
          "window.__launches.length>0 || document.querySelector('dialog [data-console-window]')?.textContent.includes('권한을 확인')",
        ),
      "authorized popup check",
    );
    if (await evaluate("window.__launches.length===0"))
      await click("dialog[open] [data-console-window]");
    await waitFor(
      () =>
        evaluate(
          "!document.querySelector('dialog[open]') && window.__launches.length===1",
        ),
      "modal closes after authorized attempt",
    );
    assert.ok(
      await evaluate(
        "window.__launches[0].url==='/projects/dash-p1/intent-classifications' && window.__launches[0].features.includes('noopener,noreferrer')",
      ),
    );
    assert.ok(
      await evaluate(
        "document.querySelector('.project-rag-control [data-console-window]').textContent.includes('다시')",
      ),
    );
    // A real popup after the fallback retry has the scoped target URL.
    await evaluate("window.open=window.__realOpen;");
    const before = (await call("Target.getTargets")).targetInfos.length;
    await click(".project-rag-control [data-console-window]");
    await pause(200);
    if ((await call("Target.getTargets")).targetInfos.length === before)
      await click(".project-rag-control [data-console-window]");
    await waitFor(async () => {
      const all = (await call("Target.getTargets")).targetInfos;
      return all.some(
        (t) => t.url === origin + "/projects/dash-p1/intent-classifications",
      );
    }, "real scoped popup");
    await cookie("dash-viewer-session");
    await navigate("/projects/dash-p1?tab=overview");
    await waitFor(
      () =>
        evaluate("!!document.querySelector('.project-rag-actions > button')"),
      "nonowner workbench",
    );
    await openRag(".project-rag-actions > button");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('dialog[open] [data-console-window]:disabled') && document.body.innerText.includes('owner만')",
        ),
      "nonowner action disabled",
    );
    const count = (await call("Target.getTargets")).targetInfos.length;
    await evaluate(
      "document.querySelector('dialog[open] [data-console-window]').click()",
    );
    assert.equal((await call("Target.getTargets")).targetInfos.length, count);
    await navigate("/projects/dash-p1/intent-classifications");
    await waitFor(
      () =>
        evaluate(
          "document.body.innerText.includes('owner 권한') && !document.querySelector('.intent-table')",
        ),
      "nonowner direct page blocked",
    );
    await cookie("dash-owner-session");
    await navigate("/dashboard");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.dashboard-project .project-rag-actions > button')",
        ),
      "dashboard modal entry",
    );
    await openRag(".dashboard-project .project-rag-actions > button");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('dialog[open] [data-console-window]:not(:disabled)')",
        ),
      "dashboard owner capability",
    );
    await evaluate(
      "window.__dashboardLaunches=[];window.open=(url)=>{window.__dashboardLaunches.push(url);return null;}",
    );
    await click("dialog[open] [data-console-window]");
    await waitFor(
      () =>
        evaluate(
          "window.__dashboardLaunches.length>0 || document.querySelector('dialog [data-console-window]')?.textContent.includes('권한을 확인')",
        ),
      "dashboard latest permission",
    );
    if (await evaluate("window.__dashboardLaunches.length===0"))
      await click("dialog[open] [data-console-window]");
    await waitFor(
      () =>
        evaluate(
          "!document.querySelector('dialog[open]') && !!document.querySelector('.dashboard-project .project-rag-actions [data-console-window]:not(:disabled)')",
        ),
      "dashboard reopen action",
    );
    await evaluate(
      "document.querySelector('.dashboard-project .project-rag-summary').textContent='embedding-model-with-a-very-long-name-'.repeat(12)+' · 자료 변경: 재벡터화 필요 · 실패';",
    );
    async function checkCardLayout() {
      const layout = await evaluate(`(()=>{
        const row=document.querySelector('.dashboard-project .project-rag-actions');
        const left=row.querySelector(':scope > button'), right=row.querySelector('[data-console-window]');
        const a=left.getBoundingClientRect(), b=right.getBoundingClientRect(), r=row.getBoundingClientRect();
        const summary=row.nextElementSibling.getBoundingClientRect();
        return {sameRow:Math.abs(a.top-b.top)<1, fits:a.width+b.width+8<=r.width+1,
          rightAligned:Math.abs(b.right-r.right)<1, overflow:row.scrollWidth>row.clientWidth+1,
          summaryBelow:summary.top>=r.bottom, common:[left,right].every(e=>e.classList.contains('button') && e.classList.contains('small'))};
      })()`);
      assert.ok(
        layout.common &&
          layout.rightAligned &&
          !layout.overflow &&
          layout.summaryBelow,
        JSON.stringify(layout),
      );
      if (layout.fits)
        assert.ok(
          layout.sameRow,
          "buttons share a row when they fit: " + JSON.stringify(layout),
        );
    }
    for (const width of [1440, 1024, 768, 420, 360, 320]) {
      await resize(width);
      await checkCardLayout();
    }
    await resize(1440);
    await click(
      ".dashboard-project .project-rag-actions [data-console-window]",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.dashboard-project [data-console-window]').textContent.includes('권한을 확인')",
        ),
      "reopen verified label",
    );
    for (const width of [1440, 420, 320]) {
      await resize(width);
      await checkCardLayout();
    }
    await resize(1440);
    await screenshot("dashboard-reopen");
    await cookie("console-admin-session");
    await navigate(
      "/admin/guardrail-control-tower?workspaceId=dash-ws&view=history",
    );
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('select[name=entryProjectId] option[value=\"console-admin-entry\"]') && document.body.innerText.includes('진입 확인 프로젝트 선택')",
        ),
      "legacy project selector",
    );
    assert.equal(
      await evaluate("!!document.querySelector('.guardrail-tower-list')"),
      false,
    );
    await evaluate(
      "(()=>{const e=document.querySelector('select[name=entryProjectId]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'console-admin-entry');e.dispatchEvent(new Event('change',{bubbles:true}));})()",
    );
    await waitFor(
      () => evaluate("!document.querySelector('form button').disabled"),
      "legacy project selection",
    );
    await click("form button");
    await waitFor(
      () =>
        evaluate(
          "document.body.innerText.includes('전체 관제') && document.body.innerText.includes('console-admin entry') && !!document.querySelector('.guardrail-tower-nav')",
        ),
      "guarded history entry",
    );
    assert.ok(
      await evaluate(
        "location.search.includes('entryProjectId=console-admin-entry') && location.search.includes('view=history')",
      ),
    );
    await navigate("/admin/settings?tab=guardrails");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.guardrail-console-entry select[name=entryProjectId] option[value=\"console-admin-entry\"]')",
        ),
      "settings guardrail entry",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.guardrail-console-entry button').disabled",
      ),
      true,
    );
    assert.equal(
      await evaluate(
        "!!document.querySelector('.guardrail-console-entry a[target=_blank]')",
      ),
      false,
    );
    await evaluate(
      "(()=>{const e=document.querySelector('.guardrail-console-entry select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'console-admin-entry');e.dispatchEvent(new Event('change',{bubbles:true}));})()",
    );
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.guardrail-console-entry [data-console-window]:not(:disabled)')",
        ),
      "settings owner button",
    );
    await evaluate(
      "window.__guardLaunches=[];window.open=(url)=>{window.__guardLaunches.push(url);return null;}",
    );
    await click(".guardrail-console-entry [data-console-window]");
    await waitFor(
      () =>
        evaluate(
          "window.__guardLaunches.length>0 || document.querySelector('[data-console-window]')?.textContent.includes('권한을 확인')",
        ),
      "guardrail latest owner check",
    );
    if (await evaluate("window.__guardLaunches.length===0"))
      await click(".guardrail-console-entry [data-console-window]");
    assert.ok(
      await evaluate(
        "window.__guardLaunches[0].includes('entryProjectId=console-admin-entry')",
      ),
    );
    await navigate(
      "/admin/guardrail-control-tower?workspaceId=dash-ws&entryProjectId=console-admin-entry",
    );
    await waitFor(
      () => evaluate("!!document.querySelector('.guardrail-tower-nav')"),
      "tower before permission revocation",
    );
    await dbAccessRevoked();
    await evaluate(
      "window.dispatchEvent(new Event('matrix-project-access-changed'))",
    );
    await waitFor(
      () =>
        evaluate(
          "document.body.innerText.includes('표시하던 데이터는 숨겼습니다') && !document.querySelector('.guardrail-tower-nav')",
        ),
      "permission event hides cached data",
    );
    // Use the exported event name from the module's source-independent contract.
    await navigate(
      "/admin/guardrail-control-tower?workspaceId=dash-ws&entryProjectId=console-admin-entry",
    );
    await waitFor(
      () =>
        evaluate(
          "document.body.innerText.includes('owner 권한') && !document.querySelector('.guardrail-tower-nav')",
        ),
      "revoked server entry",
    );
    assert.ok(
      requests.filter(
        (u) => u.includes("/api/") && u.includes("intent-classifications"),
      ).length >= 2,
    );
    console.log(
      "intent browser: reference source/chunk links, deletion notice, version mismatch, deep link, Escape and narrow dialog; console shell, 320–1440px layout, draft/selection/theme preservation, dashboard reopen alignment and long summary, list/detail, both modal entries, owner/no-owner popup behavior, no-handle fallback, legacy project selection and revoked direct entry passed",
    );
  } catch (error) {
    if (socket?.readyState === WebSocket.OPEN) {
      await screenshot("failure");
      await writeFile(
        resolve(".auth-tests/intent-console/failure.html"),
        await evaluate("document.documentElement.outerHTML"),
      );
    }
    throw error;
  } finally {
    socket?.close();
    stop(browser);
    stop(server);
  }
  async function dbAccessRevoked() {
    await fixture.db.execute(
      "UPDATE product_members SET status='revoked' WHERE user_id='console-admin' AND product_id='console-product'",
    );
  }
}
