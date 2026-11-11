// Real settings UI, synthetic users/SQLite, separate Chrome profile. No member DB or paid calls.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { checkProjectTemplateUI } from "./planning-project-template-browser-checks.mjs";
import { checkSelectElement } from "./planning-select-browser-checks.mjs";
import { checkPreviewCapture } from "./planning-preview-capture-checks.mjs";
import { checkScreenListPreview } from "./planning-screen-list-preview-checks.mjs";
import {
  checkCanvasInteractions,
  addPersistenceText,
} from "./planning-board-interaction-checks.mjs";
const folder = await mkdtemp(join(tmpdir(), "matrix-planning-board-browser-"));
const url = pathToFileURL(join(folder, "test.db")).href,
  origin = "http://localhost:3277";
const db = createClient({ url, timeout: 5000 });
let server,
  browser,
  socket,
  sessionId,
  serial = 0,
  logs = "";
const pending = new Map();
const failures = [];
const previewRegression = process.env.PLANNING_PREVIEW_REGRESSION === "1";
const screenListRegression =
  process.env.PLANNING_SCREEN_LIST_REGRESSION === "1";
const templateDialogRegression =
  process.env.PLANNING_TEMPLATE_DIALOG_REGRESSION === "1";
const developmentRegression = templateDialogRegression || previewRegression;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function assertSharedDialog(label) {
  const originalTheme = await evaluate(
    "document.documentElement.dataset.theme",
  );
  for (const theme of ["light", "dark"]) {
    const result = await evaluate(`(() => {
      document.documentElement.dataset.theme = ${JSON.stringify(theme)};
      const dialog = document.querySelector('dialog[open]');
      const read = element => {const style=getComputedStyle(element);return [style.backgroundColor,style.color]};
      const reference=document.createElement('button');reference.className='button primary';document.body.append(reference);
      const primary=dialog.querySelector('button[type="submit"]');
      const result={shared:dialog.classList.contains('planning-shared-dialog'),width:dialog.getBoundingClientRect().width,
        title:getComputedStyle(dialog.querySelector('h2')).fontSize,close:!!dialog.querySelector('.admin-detail-close'),
        overflow:getComputedStyle(dialog.querySelector('.admin-detail-body')).overflowY,
        separate:!dialog.querySelector('.admin-detail-body .project-registration-footer'),
        primary:primary?read(primary):null,reference:read(reference)};
      reference.remove();return result;
    })()`);
    assert.equal(result.shared, true);
    assert.ok(result.width <= 520);
    assert.equal(result.title, "12px");
    assert.equal(result.close, true);
    assert.equal(result.overflow, "auto");
    assert.equal(result.separate, true);
    if (result.primary)
      assert.deepEqual(
        result.primary,
        result.reference,
        `${label} ${theme} common button colors`,
      );
    await screenshot(`planning-modal-${label}-${theme}`);
  }
  await evaluate(
    `document.documentElement.dataset.theme=${JSON.stringify(originalTheme)}`,
  );
}
async function waitFor(test, label) {
  for (let index = 0; index < (developmentRegression ? 600 : 150); index++) {
    try {
      const result = await test();
      if (result) return result;
    } catch {}
    await pause(100);
  }
  throw new Error(`Timed out: ${label}`);
}
function call(method, params = {}, attached = true) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timeout = setTimeout(
      () => {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      },
      developmentRegression ? 90000 : 20000,
    );
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
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
      `${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text} [${expression.slice(0, 160)}]`,
    );
  return result.result.value;
}
async function input(selector, value, select = false) {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});const prototype=${select ? "HTMLSelectElement.prototype" : "e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype"};Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${select ? "change" : "input"}',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await pause(150);
}
async function screenshot(name) {
  const result = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    join(folder, `${name}.png`),
    Buffer.from(result.data, "base64"),
  );
}

function contrast(foreground, background) {
  const luminance = (color) => {
    const values = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
    const channels = values.map((value) =>
      color.startsWith("color(") ? value : value / 255,
    );
    return channels
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0,
      );
  };
  const a = luminance(foreground),
    b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

async function assertEditorTheme(theme) {
  const snapshot = await evaluate(`(()=>{
    const probe=document.createElement('span');document.body.append(probe);
    const token=name=>{probe.style.color='var('+name+')';return getComputedStyle(probe).color};
    const read=selector=>{const element=document.querySelector(selector);const s=getComputedStyle(element);return {color:s.color,background:s.backgroundColor,border:s.borderTopColor,opacity:s.opacity,grid:s.backgroundImage,disabled:element.disabled}};
    const result={surface:token('--surface'),canvas:token('--canvas'),ink:token('--ink'),line:token('--line'),primary:token('--primary'),soft:token('--primary-soft'),
      header:read('.topbar'),left:read('.left-panel'),toolbar:read('.canvas-toolbar'),workarea:read('.canvas'),right:read('.right-panel'),
      preview:read('.header-actions .plain-button'),history:read('.ai-history-button'),field:read('.right-panel .field input'),
      selected:read('.layer-row.selected'),device:read('.device-switch button.active'),zoom:read('.zoom-control .zoom'),
      disabled:read('[aria-label="실행 취소"]')};probe.remove();return result;
  })()`);
  if (theme === "light") {
    assert.equal(
      snapshot.toolbar.background,
      "rgb(255, 255, 255)",
      "light toolbar is unchanged",
    );
    assert.equal(
      snapshot.workarea.background,
      "rgb(237, 237, 238)",
      "light canvas workspace is unchanged",
    );
    assert.equal(
      snapshot.selected.background,
      "rgb(238, 234, 255)",
      "light selection is unchanged",
    );
    return;
  }
  for (const area of ["header", "left", "toolbar", "right"])
    assert.equal(
      snapshot[area].background,
      snapshot.surface,
      `${area} uses the shared dark surface`,
    );
  assert.equal(
    snapshot.workarea.background,
    snapshot.canvas,
    "canvas workarea uses the dark canvas token",
  );
  assert.ok(
    snapshot.workarea.grid.includes(snapshot.line),
    "canvas grid follows the dark border token",
  );
  assert.equal(
    snapshot.field.background,
    snapshot.canvas,
    "inspector inputs use dark controls",
  );
  assert.equal(snapshot.selected.background, snapshot.soft);
  assert.equal(snapshot.device.background, snapshot.soft);
  for (const name of [
    "preview",
    "history",
    "field",
    "selected",
    "device",
    "zoom",
  ]) {
    const background = ["field"].includes(name)
      ? snapshot.canvas
      : ["selected", "device"].includes(name)
        ? snapshot.soft
        : snapshot.surface;
    assert.ok(
      contrast(snapshot[name].color, background) >= 4.5,
      `${name} dark text contrast: ${JSON.stringify(snapshot[name])}`,
    );
  }
  if (snapshot.disabled.disabled)
    assert.equal(
      Number(snapshot.disabled.opacity),
      0.5,
      "disabled actions remain distinct",
    );
  for (const selected of [false, true]) {
    const rowSelector = selected
      ? ".layer-row.selected"
      : ".layer-row:not(.selected)";
    const temporaryUnselected =
      !selected &&
      !(await evaluate(
        `Boolean(document.querySelector(${JSON.stringify(rowSelector)}))`,
      ));
    if (temporaryUnselected)
      await evaluate(
        "document.querySelector('.layer-row.selected').classList.remove('selected');true",
      );
    const rowPoint = await evaluate(
      `(()=>{const row=document.querySelector(${JSON.stringify(rowSelector)});row.scrollIntoView({block:'nearest'});const r=row.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
    );
    await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...rowPoint });
    const rowColors = await evaluate(
      `(()=>{const s=getComputedStyle(document.querySelector(${JSON.stringify(rowSelector)}));const probe=document.createElement('span');probe.style.color='var(--planning-hover)';document.querySelector('.planning-root').append(probe);const hover=getComputedStyle(probe).color;probe.remove();return {background:s.backgroundColor,hover}})()`,
    );
    if (temporaryUnselected)
      await evaluate(
        "document.querySelector('.layer-row').classList.add('selected');true",
      );
    assert.equal(
      rowColors.background,
      selected ? snapshot.soft : rowColors.hover,
      selected
        ? "selected layer retains its accent on hover"
        : "layer hover uses the common dark hover token",
    );
  }
  const point = await evaluate(
    "(()=>{const r=document.querySelector('.zoom-control .zoom').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()",
  );
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  const hover = await evaluate(
    "getComputedStyle(document.querySelector('.zoom-control .zoom')).backgroundColor",
  );
  assert.notEqual(
    hover,
    "rgb(244, 244, 245)",
    "hover does not restore a light background",
  );
  await evaluate("document.querySelector('.zoom-control .zoom').click()");
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.zoom-menu')).backgroundColor",
    ),
    snapshot.surface,
    "canvas popover is dark",
  );
  await evaluate(
    "document.querySelector('.zoom-control .zoom').click();document.querySelector('.right-panel .field input').focus()",
  );
  assert.equal(
    await evaluate(
      "getComputedStyle(document.querySelector('.right-panel .field input')).outlineColor",
    ),
    snapshot.primary,
    "keyboard focus uses the shared accent",
  );
  await evaluate("document.activeElement.blur()");
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
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
const objects = new Map();
const storage = createServer(async (request, response) => {
  const key = new URL(request.url, "http://synthetic-storage").pathname;
  if (request.method === "PUT") {
    const chunks = [];
    for await (const part of request) chunks.push(part);
    objects.set(key, Buffer.concat(chunks));
    response.setHeader("ETag", '"synthetic"');
    response.end();
  } else if (request.method === "GET") {
    const bytes = objects.get(key);
    response.statusCode = bytes ? 200 : 404;
    response.end(bytes ?? "");
  } else if (request.method === "DELETE") {
    objects.delete(key);
    response.statusCode = 204;
    response.end();
  } else {
    response.statusCode = 400;
    response.end();
  }
});
try {
  await db.execute("PRAGMA journal_mode=WAL");
  await new Promise((resolve) => storage.listen(0, "127.0.0.1", resolve));
  for (const name of (await readdir("db/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await db.executeMultiple(
      await readFile(join("db/migrations", name), "utf8"),
    );
  await db.executeMultiple(
    "INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('A','Synthetic A','user',1),('B','Synthetic B','user',1); INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Synthetic workspace','A'); INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','A','owner'),('ws','B','member'); INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','ws','File RFP project','A','A'); INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('p','ws','A','admin'),('p','ws','B','admin'); UPDATE user_subscriptions SET plan_code='business'; UPDATE workspaces SET plan='business',subscription_plan='business';",
  );
  for (const id of ["screen", "second", "template-target"])
    await db.execute({
      sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES (?,'ws','p','screen',?,?,? ,?,'{}',1,'A','A','now','now')",
      args: [
        id,
        id,
        id,
        "초안",
        JSON.stringify({
          definition: "Screen definition",
          details: "Screen details",
          url: "/keep",
        }),
      ],
    });
  await db.executeMultiple(
    "INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('guest','Guest','guest',1),('onboarding','Onboarding','user',0); INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','guest','viewer'),('ws','onboarding','member');",
  );
  await db.execute(
    "INSERT INTO user_preferences(user_id,default_theme,accent_color) VALUES ('A','dark','#0f766e') ON CONFLICT(user_id) DO UPDATE SET default_theme='dark',accent_color='#0f766e'",
  );
  for (const user of ["A", "B", "guest", "onboarding"])
    await db.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
      args: [
        user,
        createHash("sha256").update(`${user}-token`).digest("hex"),
        user,
        "ws",
        new Date().toISOString(),
        new Date(Date.now() + 3600000).toISOString(),
      ],
    });
  await db.executeMultiple(
    "INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('q','ws','Other project','A','A'); INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('q','ws','A','admin'); INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES ('other-screen','ws','q','screen','Q-1','other-screen','초안','{}','{}',1,'A','A','now','now');",
  );
  let serverRoot = process.cwd();
  if (developmentRegression) {
    const sourceRoot = process.cwd();
    await mkdir(resolve(".auth-tests"), { recursive: true });
    serverRoot = await mkdtemp(
      join(sourceRoot, ".auth-tests", "planning-dialog-"),
    );
    for (const name of [
      "app",
      "components",
      "lib",
      "stores",
      "styles",
      "public",
      "tsconfig.json",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
    ]) {
      await cp(join(sourceRoot, name), join(serverRoot, name), {
        recursive: true,
      });
    }
    await writeFile(
      join(serverRoot, "next.config.ts"),
      (await readFile(join(sourceRoot, "next.config.ts"), "utf8")).replace(
        "turbopack: {",
        `turbopack: { root: ${JSON.stringify(sourceRoot)},`,
      ),
    );
    await symlink(
      join(sourceRoot, "node_modules"),
      join(serverRoot, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  server = spawn(
    process.execPath,
    [
      "--import",
      pathToFileURL(resolve("scripts/ai-test-provider.mjs")).href,
      resolve("node_modules/next/dist/bin/next"),
      developmentRegression ? "dev" : "start",
      "--port",
      "3277",
    ],
    {
      cwd: serverRoot,
      windowsHide: true,
      env: {
        ...process.env,
        TURSO_DATABASE_URL: url,
        TURSO_AUTH_TOKEN: "",
        APP_URL: origin,
        OPENAI_API_KEY: "synthetic-rfp-provider",
        AI_IMAGE_ENCRYPTION_KEY: Buffer.alloc(32, 71).toString("base64"),
        OPENAI_MODELS: "gpt-5.6-sol",
        MATRIX_AI_TEST: "1",
        NEXT_TELEMETRY_DISABLED: "1",
        R2_ENDPOINT: `http://127.0.0.1:${storage.address().port}`,
        R2_ACCESS_KEY_ID: "synthetic",
        R2_SECRET_ACCESS_KEY: "synthetic",
        R2_BUCKET_NAME: "synthetic",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (data) => (logs += data));
  server.stderr.on("data", (data) => (logs += data));
  await waitFor(async () => (await fetch(`${origin}/login`)).ok, "Next server");
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
  const port = await waitFor(
    async () =>
      (
        await readFile(join(folder, "profile", "DevToolsActivePort"), "utf8")
      ).split("\n"),
    "Chrome",
  );
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data),
      item = pending.get(message.id);
    if (
      message.method === "Network.loadingFailed" ||
      message.method === "Runtime.exceptionThrown"
    )
      failures.push(message.params);
    if (item) {
      pending.delete(message.id);
      if (message.error) item.reject(new Error(JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
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
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const navigate = async (
    user,
    path = "/planning-board?projectId=p&screenId=screen",
  ) => {
    await call("Network.setCookie", {
      name: "hams_session",
      value: `${user}-token`,
      url: origin,
      httpOnly: true,
    });
    await call("Page.navigate", { url: `${origin}${path}` });
  };
  const clickText = async (selector, text) => {
    await evaluate(
      `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim().endsWith(${JSON.stringify(text)})).click()`,
    );
    await pause(150);
  };
  if (screenListRegression) {
    await navigate("A");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.artboard') && !document.querySelector('.page-more-button').disabled",
        ),
      "editor ready for screen list fixture",
    );
    await checkSelectElement({ evaluate, input, waitFor, call, screenshot });
    await evaluate("document.querySelector('.page-more-button').click()");
    await clickText(".page-menu button", "저장");
    await waitFor(
      () => evaluate("!!document.querySelector('dialog[open] form')"),
      "save screen list fixture",
    );
    await clickText('dialog[open] button[type="submit"]', "저장");
    await waitFor(
      () => evaluate("!document.querySelector('dialog[open]')"),
      "screen list fixture saved",
    );
    await navigate("A", "/projects/p?tab=screen");
    await waitFor(
      () => evaluate("!!document.querySelector('.screen-planning-actions')"),
      "screen list loaded",
    );
    await checkScreenListPreview({
      evaluate,
      call,
      waitFor,
      screenshot,
      getSession: () => sessionId,
      setSession: (value) => {
        sessionId = value;
      },
    });
    console.log(`PASS screen list preview regression. Evidence: ${folder}`);
  } else if (previewRegression) {
    await navigate("A");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.artboard') && !document.querySelector('.page-more-button').disabled",
        ),
      "development editor ready",
    );
    await checkSelectElement({ evaluate, input, waitFor, call, screenshot });
    await evaluate("document.querySelector('.page-more-button').click()");
    await clickText(".page-menu button", "저장");
    await waitFor(
      () => evaluate("!!document.querySelector('dialog[open] form')"),
      "save baseline for preview",
    );
    await clickText('dialog[open] button[type="submit"]', "저장");
    await waitFor(
      () => evaluate("!document.querySelector('dialog[open]')"),
      "preview baseline saved",
    );
    const savedPreviewSnapshot = String(
      (
        await db.execute(
          "SELECT document_json FROM planning_boards WHERE screen_artifact_id='screen'",
        )
      ).rows[0].document_json,
    );
    assert.ok(savedPreviewSnapshot.includes("Option 1"));
    await input(
      '[aria-label="selectbox 아이템 라벨"]',
      "Unsaved preview label\nCurrent edit",
    );
    await waitFor(
      () =>
        evaluate(
          "document.querySelector('.canvas-node-selected')?.textContent.includes('Unsaved preview label')",
        ),
      "unsaved label committed to editor state",
    );
    const boardReadsBefore = (
      logs.match(
        /GET \/api\/planning\/projects\/p\/screens\/screen\/board\b/g,
      ) ?? []
    ).length;
    const editorSession = sessionId;
    const beforeTargets = new Set(
      (await call("Target.getTargets", {}, false)).targetInfos.map(
        (target) => target.targetId,
      ),
    );
    await evaluate(
      "[...document.querySelectorAll('.header-actions button')].find(button=>button.textContent.includes('\ubbf8\ub9ac\ubcf4\uae30')).click()",
    );
    const target = await waitFor(
      async () =>
        (await call("Target.getTargets", {}, false)).targetInfos.find(
          (target) =>
            !beforeTargets.has(target.targetId) &&
            target.type === "page" &&
            target.url.includes("/planning-board/preview"),
        ),
      "header opens preview window",
    );
    ({ sessionId } = await call(
      "Target.attachToTarget",
      { targetId: target.targetId, flatten: true },
      false,
    ));
    await call("Runtime.enable");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.preview-viewport .planning-select-multi')",
        ),
      "unsaved preview arrives through opener handshake",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.preview-viewport').textContent.includes('Unsaved preview label')",
      ),
      true,
      "preview shows current unsaved labels",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.preview-viewport').textContent.includes('Option 1')",
      ),
      false,
      "saved labels never replace current editor state",
    );
    await pause(500);
    assert.equal(
      (
        logs.match(
          /GET \/api\/planning\/projects\/p\/screens\/screen\/board\b/g,
        ) ?? []
      ).length,
      boardReadsBefore,
      "nonce preview does not request saved document",
    );
    assert.equal(
      String(
        (
          await db.execute(
            "SELECT document_json FROM planning_boards WHERE screen_artifact_id='screen'",
          )
        ).rows[0].document_json,
      ),
      savedPreviewSnapshot,
      "preview does not save edits to the DB",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.preview-page-list button button').length",
      ),
      0,
      "preview thumbnails must not nest buttons",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.preview-page-list button :is(input,select,textarea)').length",
      ),
      0,
      "thumbnail controls must be noninteractive",
    );
    assert.ok(
      await evaluate(
        "document.querySelectorAll('.preview-thumbnail-viewport[inert][aria-hidden=\"true\"]').length",
      ),
      "thumbnails stay outside the tab order and accessibility tree",
    );
    await screenshot("planning-preview-header-development");
    await call("Target.closeTarget", { targetId: target.targetId }, false);
    sessionId = editorSession;
    console.log(
      `PASS development header preview: real popup, unsaved multi select transfer and valid thumbnail markup. Evidence: ${folder}`,
    );
  } else if (templateDialogRegression) {
    await navigate("A");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.page-more-button') && !document.querySelector('.page-more-button').disabled",
        ),
      "development editor ready",
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      await evaluate("document.querySelector('.page-more-button').click()");
      await clickText(".page-menu button", "템플릿 생성");
      await waitFor(
        () =>
          evaluate(
            "!!document.querySelector('dialog.template-create-dialog[open]')",
          ),
        "template modal remains open under Strict Mode",
      );
      await pause(500);
      assert.equal(
        await evaluate(
          "!!document.querySelector('dialog.template-create-dialog[open]')",
        ),
        true,
      );
      if (attempt === 0) {
        await call("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        });
        await call("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
          nativeVirtualKeyCode: 27,
        });
      }
      if (attempt === 1)
        await clickText("dialog.template-create-dialog button", "취소");
      if (attempt === 2) {
        await input('[aria-label="템플릿 이름"]', "Strict Mode template");
        await assertSharedDialog("template-create");
        await screenshot("planning-template-strict-mode");
        await clickText(
          "dialog.template-create-dialog button[type=submit]",
          "생성",
        );
        await waitFor(
          () =>
            evaluate(
              "[...document.querySelectorAll('[aria-label=\"템플릿 불러오기\"] option')].some(option=>option.textContent==='Strict Mode template')",
            ),
          "created template immediately listed",
        );
      }
      await waitFor(
        () =>
          evaluate("!document.querySelector('dialog.template-create-dialog')"),
        "template dialog closes normally",
      );
    }
    assert.equal(
      Number(
        (await db.execute("SELECT count(*) n FROM planning_project_templates"))
          .rows[0].n,
      ),
      1,
    );
    console.log(
      `PASS development Strict Mode template dialog: repeated open, Escape, cancel, create and project list. Evidence: ${folder}`,
    );
  } else {
    await call("Network.clearBrowserCookies");
    await call("Page.navigate", {
      url: `${origin}/planning-board?projectId=p&screenId=screen`,
    });
    await waitFor(
      () => evaluate("location.pathname==='/login'"),
      "anonymous redirect",
    );
    await navigate("guest");
    await waitFor(
      () => evaluate("location.pathname==='/guest/dashboard'"),
      "guest redirect",
    );
    await navigate("onboarding");
    await waitFor(
      () => evaluate("location.pathname==='/onboarding'"),
      "onboarding redirect",
    );
    await navigate("A");
    await pause(400);
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.artboard') && !document.querySelector('[aria-label=\"템플릿 불러오기\"]').disabled",
        ),
      "editor loaded",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.header-actions .theme-toggle').length===1 && !document.querySelector('.header-actions .avatar')",
      ),
      true,
      "profile is replaced by one shared theme toggle",
    );
    await waitFor(
      () =>
        evaluate(
          "document.documentElement.dataset.theme==='dark' && document.querySelector('.theme-toggle')?.getAttribute('aria-checked')==='true' && !document.querySelector('.theme-toggle').disabled",
        ),
      "saved member dark theme initializes in standalone editor",
    );
    await assertEditorTheme("dark");
    const darkIcon = await evaluate(
      "document.querySelector('.theme-toggle svg path').getAttribute('d')",
    );
    const canvasColor = await evaluate(
      "getComputedStyle(document.querySelector('.artboard')).backgroundColor",
    );
    await evaluate("document.querySelector('.theme-toggle').click()");
    await waitFor(
      () =>
        evaluate(
          "document.documentElement.dataset.theme==='light' && document.querySelector('.theme-toggle').getAttribute('aria-checked')==='false' && !document.querySelector('.theme-toggle').disabled",
        ),
      "single toggle saves light mode",
    );
    await assertEditorTheme("light");
    assert.notEqual(
      await evaluate(
        "document.querySelector('.theme-toggle svg path').getAttribute('d')",
      ),
      darkIcon,
      "shared icon changes from moon to sun",
    );
    assert.equal(
      (
        await db.execute(
          "SELECT default_theme FROM user_preferences WHERE user_id='A'",
        )
      ).rows[0].default_theme,
      "light",
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.artboard')).backgroundColor",
      ),
      canvasColor,
      "theme changes do not recolor the authored canvas",
    );
    await evaluate("document.querySelector('.theme-toggle').click()");
    await waitFor(
      () =>
        evaluate(
          "document.documentElement.dataset.theme==='dark' && !document.querySelector('.theme-toggle').disabled",
        ),
      "single toggle saves dark mode",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.theme-toggle svg path').getAttribute('d')",
      ),
      darkIcon,
    );
    assert.equal(
      (
        await db.execute(
          "SELECT accent_color FROM user_preferences WHERE user_id='A'",
        )
      ).rows[0].accent_color,
      "#0f766e",
      "theme toggle preserves the member accent color",
    );
    await call("Page.reload");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.artboard') && document.documentElement.dataset.theme==='dark' && document.querySelector('.theme-toggle')?.disabled===false && document.querySelector('[aria-label=\"템플릿 불러오기\"]')?.disabled===false",
        ),
      "reload restores the saved dark theme",
    );
    assert.equal(
      Number(
        (await db.execute("SELECT count(*) n FROM planning_boards")).rows[0].n,
      ),
      0,
      "opening does not create a board",
    );
    await evaluate("window.confirm=()=>true");
    await checkCanvasInteractions({
      evaluate,
      call,
      input,
      waitFor,
      screenshot,
    });
    await input(
      '[aria-label="템플릿 불러오기"]',
      "builtin:screens-template2",
      true,
    );
    await waitFor(
      () =>
        evaluate(
          "parseFloat(document.querySelector('.artboard')?.style.width)>800 && document.querySelectorAll('.custom-canvas-layer').length>10",
        ),
      "current screen document template imported",
    );
    await assertEditorTheme("dark");
    await screenshot("planning-design-dark");
    await checkSelectElement({ evaluate, input, waitFor, call, screenshot });
    await addPersistenceText({ evaluate, input });
    await evaluate(
      "window.__planningArtboard=document.querySelector('.artboard');window.__planningFetch=window.fetch;window.fetch=(path,options)=>String(path).endsWith('/access')?Promise.resolve(new Response('<html>unavailable</html>',{status:503})):window.__planningFetch(path,options);window.dispatchEvent(new Event('focus'))",
    );
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.planning-access-error') && document.querySelector('.planning-content').hidden",
        ),
      "non-JSON outage blocks the editor",
    );
    assert.equal(
      await evaluate(
        "window.__planningArtboard===document.querySelector('.artboard') && document.querySelectorAll('.custom-canvas-layer').length>10",
      ),
      true,
      "unsaved template remains mounted during outage",
    );
    await evaluate(
      "window.fetch=window.__planningFetch;window.dispatchEvent(new Event('focus'))",
    );
    await waitFor(
      () =>
        evaluate(
          "!document.querySelector('.planning-access-error') && !document.querySelector('.planning-content').hidden",
        ),
      "access retry restores the unsaved editor",
    );
    assert.equal(
      await evaluate(
        "window.__planningArtboard===document.querySelector('.artboard')",
      ),
      true,
    );
    await evaluate(
      "window.__accessHeld=false;window.fetch=(path,options)=>{if(String(path).endsWith('/access')&&!window.__accessHeld){window.__accessHeld=true;return new Promise(resolve=>window.__lateAccessResolve=resolve)}return window.__planningFetch(path,options)};window.dispatchEvent(new Event('focus'))",
    );
    await waitFor(
      () => evaluate("typeof window.__lateAccessResolve==='function'"),
      "older access request is pending",
    );
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await pause(500);
    await evaluate(
      "window.__lateAccessResolve(new Response('{}',{status:403}));window.fetch=window.__planningFetch",
    );
    await pause(150);
    assert.equal(
      await evaluate(
        "!document.querySelector('.planning-access-error') && !document.querySelector('.planning-content').hidden",
      ),
      true,
      "older response cannot revoke newer access",
    );
    for (const status of [403, 404, 200]) {
      await evaluate(
        `window.fetch=(path,options)=>String(path).endsWith('/access')?Promise.resolve(new Response('<html>invalid</html>',{status:${status}})):window.__planningFetch(path,options);window.dispatchEvent(new Event('focus'))`,
      );
      await waitFor(
        () =>
          evaluate(
            "!!document.querySelector('.planning-access-error') && document.querySelector('.planning-content').hidden",
          ),
        `access failure ${status}`,
      );
      assert.equal(
        await evaluate(
          "!!document.querySelector('.header-actions .theme-toggle') && window.__planningArtboard===document.querySelector('.artboard')",
        ),
        true,
        "non-authentication errors preserve common User and unsaved content",
      );
      await evaluate(
        "window.fetch=window.__planningFetch;window.dispatchEvent(new Event('focus'))",
      );
      await waitFor(
        () => evaluate("!document.querySelector('.planning-access-error')"),
        `recover from ${status}`,
      );
    }
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.device-switch button:not(.active)')].every(button=>button.disabled)",
      ),
      true,
      "populated device width stays fixed",
    );
    await evaluate("document.querySelector('.page-more-button').click()");
    await clickText(".page-menu button", "저장");
    await waitFor(
      () => evaluate("!!document.querySelector('dialog[open] form')"),
      "common save dialog",
    );
    await assertSharedDialog("save");
    await clickText('dialog[open] button[type="submit"]', "저장");
    await waitFor(
      async () =>
        Number(
          (await db.execute("SELECT count(*) n FROM planning_boards")).rows[0]
            .n,
        ) === 1,
      "board committed",
    );
    await waitFor(
      () => evaluate("!document.querySelector('dialog[open]')"),
      "save dialog closed",
    );
    const persisted = JSON.parse(
      String(
        (await db.execute("SELECT document_json FROM planning_boards")).rows[0]
          .document_json,
      ),
    );
    const currentTemplate = JSON.parse(
      await readFile(
        "app/(editor)/planning-board/data/screens/screens-template2.json",
        "utf8",
      ),
    );
    assert.equal(
      persisted.sizes[persisted.layers[0].id].width,
      currentTemplate.sizes[currentTemplate.layers[0].id].width,
    );
    const multilineId = Object.keys(persisted.layerText).find(
      (id) => persisted.layerText[id] === "Browser multiline\n\nSaved 😀",
    );
    assert.ok(multilineId, "multiline browser edit is saved");
    assert.equal(persisted.layerStyles[multilineId].verticalAlign, "bottom");
    const httpChecks = await evaluate(`(async()=>{
    const base='/api/planning/projects/p/screens/screen';
    const access=await fetch(base+'/access');const contract=await access.json();
    const template=await fetch('/api/planning/templates/screens-template2');
    const memoResponse=await fetch(base+'/memos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Route smoke'})});
    const memo=(await memoResponse.json()).memo;
    const patch=await fetch(base+'/memos/'+memo.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:memo.version,text:'Updated'})});
    const updated=(await patch.json()).memo;
    const removed=await fetch(base+'/memos/'+memo.id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:updated.version})});
    const old=await fetch('/planning-board/api/projects/p/screens/screen/access');
    return {statuses:[access.status,template.status,memoResponse.status,patch.status,removed.status],oldStatus:old.status,user:contract.user.id,separateAi:typeof contract.aiEnabled==='boolean'&&!Object.hasOwn(contract.user,'aiEnabled')};
  })()`);
    assert.deepEqual(httpChecks.statuses, [200, 200, 200, 200, 200]);
    assert.equal(httpChecks.oldStatus, 404);
    assert.equal(httpChecks.user, "A");
    assert.equal(httpChecks.separateAi, true);
    assert.equal(
      Number(
        (
          await db.execute(
            "SELECT version FROM project_artifacts WHERE id='screen'",
          )
        ).rows[0].version,
      ),
      2,
    );
    const png = await (
      await import("sharp")
    )
      .default({
        create: { width: 2, height: 2, channels: 4, background: "#3b8b65" },
      })
      .png()
      .toBuffer();
    await evaluate(
      `(async()=>{const base='/api/planning/projects/p/screens/screen';const read=await(await fetch(base+'/board')).json();const binary=Uint8Array.from(atob(${JSON.stringify(png.toString("base64"))}),char=>char.charCodeAt(0));const uploaded=await fetch(base+'/assets',{method:'POST',body:binary});const asset=await uploaded.json();if(!uploaded.ok)throw new Error(asset.error);const document=read.board;const flatten=layers=>layers.flatMap(layer=>[layer,...flatten(layer.children??[])]);let image=flatten(document.layers).find(layer=>layer.kind==='image');if(!image){image={id:'export-image',name:'Image',kind:'image'};document.layers[0].children.push(image);document.sizes[image.id]={width:100,height:80};document.positions[image.id]={x:0,y:0};}document.layerImages[image.id]=asset.url;const response=await fetch(base+'/board',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({document,expectedVersion:read.version,expectedScreenVersion:read.screenVersion})});if(!response.ok)throw new Error(await response.text());})()`,
    );
    await call("Page.reload");
    await waitFor(
      () =>
        evaluate("document.querySelectorAll('.custom-canvas-layer').length>10"),
      "saved private image reload",
    );
    await checkProjectTemplateUI({
      evaluate,
      call,
      input,
      waitFor,
      clickText,
      db,
      screenshot,
    });
    await clickText(".right-panel .inspector-tabs button", "코드");
    await waitFor(
      () => evaluate("document.querySelectorAll('.code-section').length===5"),
      "five code formats",
    );
    await clickText(".code-section-toggle", "HTML5");
    await waitFor(
      () =>
        evaluate(
          "[...document.querySelectorAll('.code-textarea')].some(e=>e.value.includes('<!DOCTYPE')||e.value.includes('<!doctype'))",
        ),
      "formatted HTML export",
    );
    await clickText(".code-section-toggle", "CSS");
    await waitFor(
      () =>
        evaluate(
          "[...document.querySelectorAll('.code-textarea')].some(e=>e.value.includes('data:image/png;base64,')&&!e.value.includes('/api/planning/'))",
        ),
      "portable private image embedded in export",
    );
    await clickText(".header-actions button", "변경·검토 이력");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('dialog.workspace-dialog[open] li')",
        ),
      "saved history dialog",
    );
    await assertSharedDialog("history");
    await clickText("dialog[open] .dialog-header button", "닫기");
    for (const [menu, label] of [
      ["검토", "request"],
      ["완료", "complete"],
    ]) {
      await evaluate("document.querySelector('.page-more-button').click()");
      await clickText(".page-menu button", menu);
      await waitFor(
        () => evaluate("!!document.querySelector('dialog[open] form')"),
        `${label} dialog`,
      );
      await assertSharedDialog(label);
      await evaluate(
        "document.querySelector('dialog[open] .admin-detail-close').click()",
      );
    }
    await screenshot("planning-editor");
    await navigate("A", "/planning-board/preview?projectId=p&screenId=screen");
    await waitFor(
      () => evaluate("!!document.querySelector('.preview-page-canvas')"),
      "authenticated saved preview",
    );
    await screenshot("planning-preview");
    await checkPreviewCapture({ evaluate, call, waitFor, screenshot, folder });
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.preview-page-list button button').length",
      ),
      0,
      "preview thumbnails do not nest buttons",
    );
    assert.ok(
      await evaluate(
        "document.querySelectorAll('.preview-thumbnail-viewport[inert][aria-hidden=\"true\"]').length",
      ),
      "thumbnail content is inert",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.preview-viewport .preview-element.select .planning-select-chip').length",
      ),
      2,
      "saved multi select retained in preview",
    );
    await evaluate(
      "document.querySelector('.preview-viewport .preview-element.select .planning-select-remove').click()",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.preview-viewport .preview-element.select .planning-select-chip').length",
      ),
      1,
      "preview chip can be removed locally",
    );
    assert.deepEqual(
      await evaluate(
        `(()=>{const node=[...document.querySelectorAll('.preview-element-content')].find(n=>n.textContent==='Browser multiline\\n\\nSaved 😀');return node?[getComputedStyle(node).textAlign,getComputedStyle(node).justifyContent,getComputedStyle(node.querySelector('span')).whiteSpace]:null})()`,
      ),
      ["right", "flex-end", "pre-wrap"],
      "saved preview retains both alignments and newline rendering",
    );
    await navigate("A");
    await waitFor(
      () =>
        evaluate("document.querySelectorAll('.custom-canvas-layer').length>10"),
      "editor before session expiry",
    );
    await evaluate(
      "window.__planningArtboard=document.querySelector('.artboard');true",
    );
    await db.execute(
      "UPDATE sessions SET revoked_at='expired-for-test' WHERE user_id='A'",
    );
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.planning-access-error a[href=\"/login\"]') && document.querySelector('.planning-content').hidden",
        ),
      "expired session is blocked without navigation",
    );
    assert.equal(
      await evaluate(
        "location.pathname==='/planning-board' && window.__planningArtboard===document.querySelector('.artboard')",
      ),
      true,
    );
    await db.execute("UPDATE sessions SET revoked_at=NULL WHERE user_id='A'");
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await waitFor(
      () =>
        evaluate(
          "!document.querySelector('.planning-access-error') && !!document.querySelector('.header-actions .theme-toggle')",
        ),
      "login recovery restores common User and content",
    );
    await evaluate(
      "window.history.pushState({},'', '/planning-board?projectId=p&screenId=second')",
    );
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.artboard') && document.querySelector('.page-label span')?.textContent==='second'",
        ),
      "separate screen isolated",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.custom-canvas-layer').length",
      ),
      0,
    );
    await db.execute(
      "UPDATE project_members SET role='viewer' WHERE user_id='B'",
    );
    await call("Network.setCookie", {
      name: "hams_session",
      value: "B-token",
      url: origin,
      httpOnly: true,
    });
    await evaluate("window.dispatchEvent(new Event('focus'))");
    await waitFor(
      () =>
        evaluate(
          "!!document.querySelector('.planning-access-error') && document.querySelector('.planning-content').hidden",
        ),
      "user switch blocks the previous editor",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.page-label span')?.textContent==='second' && !!document.querySelector('.header-actions .theme-toggle')",
      ),
      true,
      "user switch preserves the previous editor behind the access block",
    );
    await navigate("B");
    await waitFor(
      () =>
        evaluate("document.querySelectorAll('.custom-canvas-layer').length>10"),
      "viewer loads saved template",
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.planning-select-remove').length",
      ),
      2,
      "saved multi select survives editor reload",
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.planning-select-remove')].every(button=>button.disabled)",
      ),
      true,
      "viewer cannot remove persisted select items",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('[aria-label=\"템플릿 불러오기\"]').disabled",
      ),
      true,
    );
    assert.equal(
      await evaluate("document.querySelector('.page-more-button').disabled"),
      true,
    );
    await clickText(".right-panel .inspector-tabs button", "코드");
    assert.equal(
      await evaluate("document.querySelectorAll('.code-section').length"),
      5,
    );
    await call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    for (const theme of ["light", "dark"]) {
      await evaluate(
        `if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('.theme-toggle').click()`,
      );
      await waitFor(
        () =>
          evaluate(
            `document.documentElement.dataset.theme===${JSON.stringify(theme)} && !document.querySelector('.theme-toggle').disabled && document.querySelector('.theme-toggle').getAttribute('aria-checked')===${JSON.stringify(String(theme === "dark"))}`,
          ),
        `viewer shared theme toggle ${theme}`,
      );
      await screenshot(`planning-viewer-${theme}`);
    }
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigate("A", "/projects/p?tab=screen");
    await waitFor(
      () =>
        evaluate("!!document.querySelector('a[href*=\"planning-board?\"]')"),
      "screen list links",
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('a[href*=\"planning-board?\"]')].every(e=>e.target==='_blank'&&e.rel.includes('noopener'))",
      ),
      true,
    );
    assert.equal(
      await evaluate(
        "getComputedStyle(document.querySelector('.workspace-main')??document.body).position==='fixed'",
      ),
      false,
      "editor CSS does not leak into main screen",
    );
    await checkScreenListPreview({
      evaluate,
      call,
      waitFor,
      screenshot,
      getSession: () => sessionId,
      setSession: (value) => {
        sessionId = value;
      },
    });
    console.log(
      `PASS planning browser: new HTTP routes, anonymous/guest/onboarding redirects, standalone common User and reload, non-JSON/403/404 recovery, stale response protection, session expiry and user switch, unsaved state preservation, SPA scope isolation, template/save/assets/export/preview, viewer permissions, themes and workspace links. Evidence: ${folder}`,
    );
  }
} catch (error) {
  if (socket?.readyState === 1) await screenshot("failure").catch(() => {});
  console.error(logs.slice(-2500));
  console.error(JSON.stringify(failures));
  console.error(`Evidence: ${folder}`);
  throw error;
} finally {
  socket?.close();
  stop(browser);
  stop(server);
  await new Promise((resolve) => storage.close(resolve));
  db.close();
}
