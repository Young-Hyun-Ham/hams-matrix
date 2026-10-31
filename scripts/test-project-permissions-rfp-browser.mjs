// Real settings UI, synthetic users/SQLite, separate Chrome profile. No member DB or paid calls.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
const folder = await mkdtemp(join(tmpdir(), "matrix-project-rfp-browser-"));
const url = pathToFileURL(join(folder, "test.db")).href, origin = "http://localhost:3274";
const db = createClient({ url });
let server, browser, socket, sessionId, serial = 0, logs = "";
const pending = new Map();
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(test, label) {
  for (let index = 0; index < 150; index++) { try { const result = await test(); if (result) return result; } catch {} await pause(100); }
  throw new Error(`Timed out: ${label}`);
}
function call(method, params = {}, attached = true) {
  return new Promise((resolve, reject) => { const id = ++serial; const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, ...(attached && sessionId ? { sessionId } : {}) })); });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await pause(150); }
async function input(selector, value, select = false) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${select ? "HTMLSelectElement" : "HTMLInputElement"}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${select ? "change" : "input"}',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pause(150);
}
async function screenshot(name) {
  const result = await call("Page.captureScreenshot", { format: "png" }); await writeFile(join(folder, `${name}.png`), Buffer.from(result.data, "base64"));
}
function stop(child) { if (!child?.pid) return; if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else child.kill(); }
try {
  for (const name of (await readdir("db/migrations")).filter((name) => name.endsWith(".sql")).sort()) await db.executeMultiple(await readFile(join("db/migrations", name), "utf8"));
  await db.executeMultiple("INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('A','Synthetic A','user',1),('B','Synthetic B','user',1),('C','Synthetic C','user',1),('D','Synthetic D','user',1); INSERT INTO workspaces(id,name) VALUES ('ws','Synthetic workspace'); INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','A','owner'),('ws','B','member'),('ws','C','member'),('ws','D','viewer');");
  for (const user of ["A", "B", "C", "D"]) await db.execute({ sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)", args: [user, createHash("sha256").update(`${user}-token`).digest("hex"), user, "ws", new Date().toISOString(), new Date(Date.now() + 3600000).toISOString()] });
  await db.executeMultiple("INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','ws','Browser project','A','A'); INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('p','ws','A','admin'),('p','ws','B','admin'),('p','ws','C','member'),('p','ws','D','viewer');");
  await db.execute({sql:"INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,created_by,updated_by,created_at,updated_at) VALUES ('role-fixture','ws','p','requirement','SFR-001','Browser permission fixture','초안',?,'A','A','2026-10-31','2026-10-31')",args:[JSON.stringify({category:'SFR',definition:'Requirement',details:'Details',priority:'중'})]});
  server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--port", "3274"], { windowsHide: true, env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "", APP_URL: origin, OPENAI_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { logs += data; }); server.stderr.on("data", (data) => { logs += data; });
  await waitFor(async () => (await fetch(`${origin}/login`)).ok, "Next server");
  browser = spawn(process.env.MATRIX_TEST_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${join(folder, "profile")}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  const port = await waitFor(async () => (await readFile(join(folder, "profile", "DevToolsActivePort"), "utf8")).split("\n"), "Chrome");
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = (event) => { const message = JSON.parse(event.data), item = pending.get(message.id); if (item) { pending.delete(message.id); if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result); } };
  const { targetId } = await call("Target.createTarget", { url: "about:blank" }, false);
  ({ sessionId } = await call("Target.attachToTarget", { targetId, flatten: true }, false));
  await call("Network.enable"); await call("Page.enable"); await call("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  async function navigate(user,path){await call('Network.setCookie',{name:'hams_session',value:`${user}-token`,url:origin,httpOnly:true});await call('Page.navigate',{url:origin+path});}
  async function clickText(selector,text){await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.includes(${JSON.stringify(text)})).click()`);await pause(200);}
  await navigate('A','/projects/p?tab=rfp');
  await waitFor(()=>evaluate("!!document.querySelector('#rfp-title') && !document.querySelector('#rfp-title').readOnly"),'owner editor');
  assert.equal(await evaluate("document.querySelector('#rfp-basic-background').value"),'');
  await input('#rfp-title','Browser RFP');
  await clickText('.rfp-header-actions button','저장');
  await waitFor(async()=>Number((await db.execute('SELECT COUNT(*) AS n FROM project_rfp_documents')).rows[0].n)===1,'RFP persisted');
  await waitFor(()=>evaluate("document.querySelector('.rfp-sample-label').textContent.includes('저장본')"),'saved state');
  await screenshot('rfp-owner');
  await navigate('A','/projects/p?tab=rfp');
  await waitFor(()=>evaluate("document.querySelector('#rfp-title')?.value==='Browser RFP'"),'RFP reload');
  await input('#rfp-title','Unsaved before role downgrade');
  await evaluate("window.rfpWriteRequests=0;const original=window.fetch;window.fetch=(url,options)=>{if(String(url).endsWith('/rfp')&&['POST','PATCH','DELETE'].includes(options?.method))window.rfpWriteRequests++;return original(url,options)}");
  await db.execute("UPDATE projects SET owner_id='B' WHERE id='p'");
  await db.execute("UPDATE project_members SET role='viewer' WHERE project_id='p' AND user_id='A'");
  await clickText('.rfp-header-actions button','저장');
  await waitFor(()=>evaluate("document.querySelector('.matrix-project-role')?.textContent.includes('viewer') && document.querySelector('#rfp-title').readOnly"),'live downgrade RFP rights');
  assert.equal(await evaluate('window.rfpWriteRequests'),0,'fresh permission preflight blocks the RFP mutation before it is sent');
  assert.equal(JSON.parse((await db.execute("SELECT document_json FROM project_rfp_documents WHERE project_id='p' AND deleted_at IS NULL")).rows[0].document_json).title,'Browser RFP');
  assert.equal(await evaluate("[...document.querySelectorAll('.rfp-header-actions button')].some(b=>b.textContent==='저장')"),false);
  await db.execute("UPDATE projects SET owner_id='A' WHERE id='p'");
  await db.execute("UPDATE project_members SET role='admin' WHERE project_id='p' AND user_id='A'");
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor(()=>evaluate("!document.querySelector('#rfp-title').readOnly"),'restored owner permissions');
  await input('#rfp-title','Browser RFP');
  await navigate('B','/projects/p?tab=rfp');
  await waitFor(()=>evaluate("document.querySelector('#rfp-title')?.value==='Browser RFP' && document.querySelector('#rfp-title').readOnly"),'admin RFP read only');
  assert.equal(await evaluate("[...document.querySelectorAll('.rfp-header-actions button')].some(b=>b.textContent==='저장')"),false);
  await navigate('A','/team');
  await waitFor(()=>evaluate("!!document.querySelector('select[aria-label=\"팀 공유 프로젝트 선택\"] option[value=p]')"),'team projects');
  await input('select[aria-label="팀 공유 프로젝트 선택"]','p',true);
  await waitFor(()=>evaluate("[...document.querySelectorAll('.page-heading button')].some(b=>b.textContent==='역할별 권한 설정')"),'owner permissions button');
  await clickText('.page-heading button','역할별 권한 설정');
  await waitFor(()=>evaluate("!!document.querySelector('dialog[open] input[aria-label=\"admin 요구사항 DELETE\"]')"),'permission matrix');
  assert.equal(await evaluate("document.querySelectorAll('dialog[open] [role=tablist] [role=tab]').length"),4);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('dialog[open] [role=tab][aria-selected=true]')).borderTopWidth"),'2px');
  await evaluate("document.querySelector('dialog[open] [role=tab][aria-selected=true]').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");
  await waitFor(()=>evaluate("document.querySelector('dialog[open] [role=tab][aria-selected=true]').textContent==='viewer'"),'viewer keyboard tab');
  assert.equal(await evaluate("document.activeElement.textContent"),'viewer');
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))");
  await waitFor(()=>evaluate("document.querySelector('dialog[open] [role=tab][aria-selected=true]').textContent==='owner'"),'owner keyboard tab');
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  await waitFor(()=>evaluate("document.querySelector('dialog[open] [role=tab][aria-selected=true]').textContent==='admin'"),'admin keyboard tab');
  assert.equal(await evaluate("document.querySelector('input[aria-label=\"admin 제안요청서 UPDATE\"]').disabled"),true);
  await click('input[aria-label="admin 요구사항 DELETE"]');
  await screenshot('project-permissions');
  await clickText('dialog[open] .project-registration-footer button','저장');
  await waitFor(async()=>Number((await db.execute("SELECT can_delete FROM project_role_tab_permissions WHERE project_id='p' AND role='admin' AND tab_key='requirement'")).rows[0]?.can_delete)===0,'policy persisted');
  await navigate('B','/team');
  await waitFor(()=>evaluate("!!document.querySelector('select[aria-label=\"팀 공유 프로젝트 선택\"] option[value=p]')"),'admin team');
  await input('select[aria-label="팀 공유 프로젝트 선택"]','p',true);await pause(500);
  assert.equal(await evaluate("[...document.querySelectorAll('.page-heading button')].some(b=>b.textContent==='역할별 권한 설정')"),false);
  await navigate('B','/projects/p?tab=requirement');
  await waitFor(()=>evaluate("document.querySelector('.matrix-project-role')?.textContent.includes('admin') && document.querySelector('.matrix-tab-content tbody')?.textContent.includes('Browser permission fixture')"),'admin requirement permissions');
  assert.equal(await evaluate("[...document.querySelectorAll('.matrix-tab-content tbody button')].some(b=>b.textContent.trim()==='삭제'&&!b.disabled)"),false);
  await clickText('.matrix-tab-content tbody button','수정');
  await waitFor(()=>evaluate("!!document.querySelector('dialog[open] button[type=submit]')"),'admin edit dialog');
  await db.execute("UPDATE project_role_tab_permissions SET can_create=0,can_update=0 WHERE project_id='p' AND role='admin' AND tab_key='requirement'");
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor(()=>evaluate("document.querySelector('dialog[open] fieldset')?.disabled===true && !document.querySelector('dialog[open] button[type=submit]')"),'open dialog loses UPDATE permission');
  await click('dialog[open] .admin-detail-close');
  assert.equal(await evaluate("[...document.querySelectorAll('.matrix-tab-content button')].some(b=>b.textContent.trim()==='요구사항 등록'&&!b.disabled)"),false);
  await db.execute("UPDATE project_role_tab_permissions SET can_delete=1 WHERE project_id='p' AND role='admin' AND tab_key='requirement'");
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor(()=>evaluate("[...document.querySelectorAll('.matrix-tab-content tbody button')].some(b=>b.textContent.trim()==='삭제'&&!b.disabled)"),'DELETE only action');
  await clickText('.matrix-tab-content tbody button','삭제');
  await db.execute("UPDATE project_role_tab_permissions SET can_delete=0 WHERE project_id='p' AND role='admin' AND tab_key='requirement'");
  await evaluate("window.dispatchEvent(new Event('focus'))");
  await waitFor(()=>evaluate("document.querySelector('dialog[open] .button.primary')?.disabled===true"),'open confirmation loses DELETE permission');
  await clickText('dialog[open] button','취소');
  await navigate('C','/projects/p?tab=wbs');
  await waitFor(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='저장')"),'member WBS');
  assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='저장').disabled"),true);
  await navigate('D','/projects/p?tab=rfp');
  await waitFor(()=>evaluate("document.querySelector('#rfp-title')?.value==='Browser RFP'"),'viewer RFP');
  assert.equal(await evaluate("document.querySelector('#rfp-title').readOnly"),true);
  await screenshot('rfp-viewer');
  for(const tab of ['overview','wbs','architecture','requirement','screen','database','program','test','trace','acceptance','history','export','documents']){
    await navigate('D',`/projects/p?tab=${tab}`);
    await waitFor(()=>evaluate("document.querySelector('.matrix-project-role')?.textContent.includes('viewer')"),`viewer ${tab} access`);
    const enabled=await evaluate("[...document.querySelectorAll('.matrix-tab-content button')].filter(b=>!b.disabled && !b.closest('dialog:not([open])') && /^(저장|수정|삭제|배포|코드 저장|파일 업로드|폴더 추가|.* 등록)$/.test(b.textContent.trim())).map(b=>b.textContent.trim())");
    assert.deepEqual(enabled,[],`viewer has no enabled mutation button on ${tab}`);
  }
  console.log(`PASS: browser owner RFP save/reload, admin/viewer read-only RFP, member read-only WBS, owner policy modal and persistence. Evidence: ${folder}`);
}catch(error){if(socket?.readyState===1)await screenshot('failure').catch(()=>{});console.error(logs.slice(-2000));console.error(`Evidence: ${folder}`);throw error;}
finally{socket?.close();stop(browser);stop(server);db.close();}
