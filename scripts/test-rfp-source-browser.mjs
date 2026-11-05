// Real settings UI, synthetic users/SQLite, separate Chrome profile. No member DB or paid calls.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
const folder = await mkdtemp(join(tmpdir(), "matrix-rfp-source-browser-"));
const url = pathToFileURL(join(folder, "test.db")).href, origin = "http://localhost:3275";
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
async function input(selector, value, select = false) {
  await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const prototype=${select ? "HTMLSelectElement.prototype" : "e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype"};Object.getOwnPropertyDescriptor(prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${select ? "change" : "input"}',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await pause(150);
}
async function screenshot(name) {
  const result = await call("Page.captureScreenshot", { format: "png" }); await writeFile(join(folder, `${name}.png`), Buffer.from(result.data, "base64"));
}
function stop(child) { if (!child?.pid) return; if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else child.kill(); }
const objects=new Map();
const storage=createServer(async(request,response)=>{
  const key=new URL(request.url,"http://synthetic-storage").pathname;
  if(request.method==="PUT"){const chunks=[];for await(const part of request)chunks.push(part);objects.set(key,Buffer.concat(chunks));response.setHeader("ETag",'"synthetic"');response.end();}
  else if(request.method==="GET"){const bytes=objects.get(key);response.statusCode=bytes?200:404;response.end(bytes??"");}
  else if(request.method==="DELETE"){objects.delete(key);response.statusCode=204;response.end();}
  else{response.statusCode=400;response.end();}
});
try{
  await new Promise(resolve=>storage.listen(0,"127.0.0.1",resolve));
  for(const name of(await readdir("db/migrations")).filter(name=>name.endsWith(".sql")).sort())await db.executeMultiple(await readFile(join("db/migrations",name),"utf8"));
  await db.executeMultiple("INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('A','Synthetic A','user',1),('B','Synthetic B','user',1); INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Synthetic workspace','A'); INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','A','owner'),('ws','B','member'); INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','ws','File RFP project','A','A'); INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('p','ws','A','admin'),('p','ws','B','admin'); UPDATE user_subscriptions SET plan_code='business';");
  for(const user of["A","B"])await db.execute({sql:"INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",args:[user,createHash("sha256").update(`${user}-token`).digest("hex"),user,"ws",new Date().toISOString(),new Date(Date.now()+3600000).toISOString()]});
  server=spawn(process.execPath,["--import",pathToFileURL(resolve("scripts/ai-test-provider.mjs")).href,resolve("node_modules/next/dist/bin/next"),"start","--port","3275"],{windowsHide:true,env:{...process.env,TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:"",APP_URL:origin,OPENAI_API_KEY:"synthetic-rfp-provider",OPENAI_MODELS:"gpt-5.6-sol",MATRIX_AI_TEST:"1",NEXT_TELEMETRY_DISABLED:"1",R2_ENDPOINT:`http://127.0.0.1:${storage.address().port}`,R2_ACCESS_KEY_ID:"synthetic",R2_SECRET_ACCESS_KEY:"synthetic",R2_BUCKET_NAME:"synthetic"},stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",data=>logs+=data);server.stderr.on("data",data=>logs+=data);
  await waitFor(async()=>(await fetch(`${origin}/login`)).ok,"Next server");
  browser=spawn(process.env.MATRIX_TEST_BROWSER||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${join(folder,"profile")}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
  const port=await waitFor(async()=>(await readFile(join(folder,"profile","DevToolsActivePort"),"utf8")).split("\n"),"Chrome");
  socket=new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const message=JSON.parse(event.data),item=pending.get(message.id);if(item){pending.delete(message.id);if(message.error)item.reject(new Error(JSON.stringify(message.error)));else item.resolve(message.result);}};
  const {targetId}=await call("Target.createTarget",{url:"about:blank"},false);({sessionId}=await call("Target.attachToTarget",{targetId,flatten:true},false));
  await call("Network.enable");await call("Page.enable");await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const navigate=async(user,tab="rfp")=>{await call("Network.setCookie",{name:"hams_session",value:`${user}-token`,url:origin,httpOnly:true});await call("Page.navigate",{url:`${origin}/projects/p?tab=${tab}`});};
  const clickText=async(selector,text)=>{await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await pause(150);};
  const choose=async(name,text)=>{await evaluate(`(()=>{const picker=document.querySelector('.rfp-source input[type=file]'),transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(text)}],${JSON.stringify(name)},{type:'text/plain'}));picker.files=transfer.files;picker.dispatchEvent(new Event('change',{bubbles:true}));})()`);};
  await navigate("A");await waitFor(()=>evaluate("!!document.querySelector('.rfp-source input')&&!document.querySelector('.rfp-source input').disabled"),"attachment picker");
  const openHistory=async()=>{await evaluate("document.querySelector('.rfp-history-trigger').click()");await waitFor(()=>evaluate("!!document.querySelector('.rfp-history-dialog[open]')&&!document.querySelector('.rfp-history-dialog [role=status]')"),"history loaded");};
  await openHistory();assert.equal(await evaluate("document.querySelector('.rfp-history-dialog').textContent.includes('생성 이력이 없습니다.')"),true);
  await clickText(".rfp-history-dialog .admin-detail-header button","닫기");
  await choose("source.txt","Synthetic original project context.");
  await waitFor(()=>evaluate("document.querySelector('.rfp-source-file')?.textContent.includes('source.txt')&&!document.querySelector('.rfp-source').getAttribute('aria-busy').includes('true')"),"file uploaded");
  const file=(await db.execute("SELECT id FROM project_files")).rows[0].id;assert.equal((await db.execute("SELECT file_id FROM project_rfp_sources")).rows[0].file_id,file);
  await clickText(".rfp-source button","AI로 제안 요청서 생성");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('dialog[open]')).borderRadius"),"10px");
  const scopePrompt="보안 요구사항만 간결하게 정리하고 사업 개요는 한 문단으로 작성해 주세요.";
  assert.equal(await evaluate("document.querySelector('#rfp-generation-scope').maxLength"),2000);
  await input("#rfp-generation-scope",scopePrompt);
  await clickText("dialog[open] .project-registration-footer button","취소");assert.equal((await db.execute("SELECT * FROM project_rfp_documents")).rows.length,0);
  await clickText(".rfp-source button","AI로 제안 요청서 생성");assert.equal(await evaluate("document.querySelector('#rfp-generation-scope').value"),scopePrompt);await clickText("dialog[open] .project-registration-footer button","생성하여 저장");
  await waitFor(()=>evaluate("document.querySelector('#rfp-title')?.value==='File generated RFP'"),"generated DB document in editor");
  assert.equal(Number((await db.execute("SELECT version FROM project_rfp_documents")).rows[0].version),1);
  assert.equal(JSON.parse((await db.execute("SELECT input_json FROM project_rfp_generation_requests")).rows[0].input_json).prompt,scopePrompt);
  await openHistory();
  assert.equal(await evaluate("document.querySelector('.rfp-history-item').textContent.includes('source.txt')&&document.querySelector('.rfp-history-item').textContent.includes('완료')&&document.querySelector('.rfp-history-item').textContent.includes('v1')"),true);
  assert.equal(await evaluate("document.querySelector('.rfp-history-prompt').textContent"),scopePrompt);
  await call("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await call("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
  await waitFor(()=>evaluate("!document.querySelector('.rfp-history-dialog')"),"Escape closes history");
  await input("#rfp-title","Unsaved edit");assert.equal(await evaluate("[...document.querySelectorAll('.rfp-source button')].find(e=>e.textContent==='AI로 제안 요청서 생성').disabled"),true);
  await input("#rfp-title","File generated RFP");
  await clickText(".rfp-source button","문서함에서 보기");await waitFor(()=>evaluate("!!document.querySelector('.document-rfp-source')"),"document library source badge");
  assert.equal(await evaluate("[...document.querySelectorAll('.document-table button')].find(e=>e.textContent.trim()==='삭제').disabled"),true);
  const download=await evaluate(`fetch('/api/projects/p/documents/files/${file}').then(r=>r.text())`);assert.equal(download,"Synthetic original project context.");
  await navigate("A");await waitFor(()=>evaluate("!!document.querySelector('.rfp-source-file')"),"attachment persisted");
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const theme of["light","dark"]){await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);assert.equal(await evaluate("(()=>{const e=document.querySelector('.rfp-source');return e.scrollWidth<=e.clientWidth+1})()"),true);await screenshot(`rfp-source-mobile-${theme}`);}
  await clickText(".rfp-source button","AI로 제안 요청서 생성");
  for(const theme of["light","dark"]){await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);assert.equal(await evaluate("(()=>{const dialog=document.querySelector('dialog[open]'),textarea=document.querySelector('#rfp-generation-scope');return dialog.scrollWidth<=dialog.clientWidth+1&&textarea.getBoundingClientRect().width<=dialog.clientWidth})()"),true);await screenshot(`rfp-scope-mobile-${theme}`);}
  await clickText("dialog[open] .project-registration-footer button","취소");
  await openHistory();
  for(const theme of["light","dark"]){await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);assert.equal(await evaluate("(()=>{const d=document.querySelector('.rfp-history-dialog');return d.scrollWidth<=d.clientWidth+1&&getComputedStyle(d).borderRadius==='10px'})()"),true);await screenshot(`rfp-history-mobile-${theme}`);}
  await clickText(".rfp-history-dialog .admin-detail-header button","닫기");
  await clickText(".rfp-source button","첨부 해제");await clickText("dialog[open] .project-registration-footer button","첨부 해제");
  await waitFor(()=>evaluate("!document.querySelector('.rfp-source-file')"),"source detached");
  await openHistory();assert.equal(await evaluate("document.querySelectorAll('.rfp-history-item').length"),1);await clickText(".rfp-history-dialog .admin-detail-header button","닫기");
  assert.equal((await db.execute("SELECT * FROM project_files")).rows.length,1);assert.equal((await db.execute("SELECT * FROM project_rfp_documents")).rows.length,1);
  await navigate("B");await waitFor(()=>evaluate("!!document.querySelector('.rfp-source')&&document.querySelector('#rfp-title')?.readOnly"),"admin read-only RFP");
  assert.equal(await evaluate("[...document.querySelectorAll('.rfp-source button')].some(e=>/^(파일 첨부|교체|첨부 해제|AI로 제안 요청서 생성)$/.test(e.textContent.trim()))"),false);
  await openHistory();assert.equal(await evaluate("document.querySelectorAll('.rfp-history-item').length"),0);
  console.log(`PASS RFP source browser: upload, common confirmation/cancel, AI DB save, dirty protection, shared library/download, mobile themes, detach retention and read-only admin. Evidence: ${folder}`);
}catch(error){if(socket?.readyState===1)await screenshot("failure").catch(()=>{});console.error(logs.slice(-2500));console.error(`Evidence: ${folder}`);throw error;}
finally{socket?.close();stop(browser);stop(server);await new Promise(resolve=>storage.close(resolve));db.close();}
