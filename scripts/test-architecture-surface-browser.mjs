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
const folder = await mkdtemp(join(tmpdir(), "matrix-architecture-surface-browser-"));
const url = pathToFileURL(join(folder, "test.db")).href, origin = "http://localhost:3276";
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
  const topology={nodes:[{id:"api",name:"API",technology:"FastAPI",layer:"backend",shape:"service"},{id:"db",name:"DB",technology:"PostgreSQL",layer:"data",shape:"database"}],edges:[{id:"sql",source:"api",target:"db",label:"SQL"}]};
  for(const id of ["arc","other-arc"])await db.execute({sql:"INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES (?,'ws','p','architecture',?,?,? ,?,?,1,'A','A','now','now')",args:[id,id,id,"\uCD08\uC548",JSON.stringify({definition:"API and DB",owner:"A",notes:""}),JSON.stringify({topology})]});
  for(const user of["A","B"])await db.execute({sql:"INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",args:[user,createHash("sha256").update(`${user}-token`).digest("hex"),user,"ws",new Date().toISOString(),new Date(Date.now()+3600000).toISOString()]});
  server=spawn(process.execPath,["--import",pathToFileURL(resolve("scripts/ai-test-provider.mjs")).href,resolve("node_modules/next/dist/bin/next"),"start","--port","3276"],{windowsHide:true,env:{...process.env,TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:"",APP_URL:origin,OPENAI_API_KEY:"synthetic-rfp-provider",AI_IMAGE_ENCRYPTION_KEY:Buffer.alloc(32,71).toString("base64"),OPENAI_MODELS:"gpt-5.6-sol",MATRIX_AI_TEST:"1",NEXT_TELEMETRY_DISABLED:"1",R2_ENDPOINT:`http://127.0.0.1:${storage.address().port}`,R2_ACCESS_KEY_ID:"synthetic",R2_SECRET_ACCESS_KEY:"synthetic",R2_BUCKET_NAME:"synthetic"},stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",data=>logs+=data);server.stderr.on("data",data=>logs+=data);
  await waitFor(async()=>(await fetch(`${origin}/login`)).ok,"Next server");
  browser=spawn(process.env.MATRIX_TEST_BROWSER||"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${join(folder,"profile")}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
  const port=await waitFor(async()=>(await readFile(join(folder,"profile","DevToolsActivePort"),"utf8")).split("\n"),"Chrome");
  socket=new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const message=JSON.parse(event.data),item=pending.get(message.id);if(item){pending.delete(message.id);if(message.error)item.reject(new Error(JSON.stringify(message.error)));else item.resolve(message.result);}};
  const {targetId}=await call("Target.createTarget",{url:"about:blank"},false);({sessionId}=await call("Target.attachToTarget",{targetId,flatten:true},false));
  await call("Network.enable");await call("Page.enable");await call("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const navigate=async(user,tab="architecture")=>{await call("Network.setCookie",{name:"hams_session",value:`${user}-token`,url:origin,httpOnly:true});await call("Page.navigate",{url:`${origin}/projects/p?tab=${tab}`});};
  const clickText=async(selector,text)=>{await evaluate(`[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}).click()`);await pause(150);};
  await navigate("A");
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-architecture-canvas svg')"),"initial canvas without image");
  await waitFor(()=>evaluate("[...document.querySelectorAll('.matrix-architecture-picker button')].some(button=>!button.disabled)"),"project edit permission loaded");
  assert.equal(await evaluate("document.querySelectorAll('.matrix-architecture-diagram-heading .matrix-image-actions button').length"),3);
  assert.equal(await evaluate("[...document.querySelectorAll('.matrix-image-actions button')].slice(1).every(button=>button.disabled)"),true);
  await clickText(".matrix-image-actions button","AI \uC774\uBBF8\uC9C0\uC0DD\uC131");
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-image-generate[open] select')&&!!document.querySelector('.matrix-image-generate select').value"),"image generation dialog model");
  assert.equal(await evaluate("document.querySelector('.matrix-image-generate input').value===document.querySelector('.matrix-image-generate input').placeholder"),true);
  await clickText("dialog[open] button","\uC0DD\uC131\uD558\uACE0 \uC800\uC7A5");
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-image-preview[open] img')"),"saved image preview");
  await clickText("dialog[open] header button","\uB2EB\uAE30");
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-architecture-saved-image img')&&!document.querySelector('.matrix-architecture-canvas')"),"saved image replaces canvas");
  await waitFor(()=>evaluate("[...document.querySelectorAll('.matrix-image-actions button')].every(button=>!button.disabled)"),"saved image enables actions");
  await clickText(".matrix-image-actions button","\uBBF8\uB9AC\uBCF4\uAE30");
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-image-preview[open]')&&!document.querySelector('.matrix-image-generate[open]')"),"saved image view opens without generation");
  assert.equal(await evaluate("[...document.querySelectorAll('dialog[open] button')].some(button=>button.textContent.trim()==='다시 생성')"),false);
  await clickText("dialog[open] header button","\uB2EB\uAE30");
  await clickText(".matrix-image-actions button","PNG \uC774\uBBF8\uC9C0 \uB2E4\uC6B4\uB85C\uB4DC");
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-image-preview[open]')&&!document.querySelector('.matrix-image-generate[open]')"),"saved image view opens without generation");
  await clickText("dialog[open] header button","\uB2EB\uAE30");
  await clickText(".matrix-image-actions button","AI \uC774\uBBF8\uC9C0\uC0DD\uC131");
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-image-generate[open] select')&&!!document.querySelector('.matrix-image-generate select').value&&!document.querySelector('.matrix-image-generate header button').disabled"),"explicit regeneration dialog");
  await clickText("dialog[open] header button","\uCDE8\uC18C");
  await waitFor(()=>evaluate("!document.querySelector('dialog.matrix-image-modal[open]')"),"cancel closes explicit generation");
  await clickText(".matrix-architecture-tabs button","Mermaid");
  await waitFor(()=>evaluate("document.querySelector('.architecture-code-editor textarea')?.value.startsWith('flowchart LR')"),"Mermaid updated from generated image");
  await waitFor(()=>evaluate("!!document.querySelector('.architecture-preview-canvas svg')"),"image-based Mermaid renders");
  const mermaid=await evaluate("document.querySelector('.architecture-code-editor textarea').value");
  await input(".architecture-code-editor textarea",mermaid+"\n%% local edit");
  assert.equal(await evaluate("[...document.querySelectorAll('.matrix-image-actions button')].every(button=>button.disabled)"),true);
  await input(".architecture-code-editor textarea",mermaid);
  assert.equal(Number((await db.execute("SELECT version FROM project_artifacts WHERE id='arc'")).rows[0].version),2);
  await clickText(".matrix-architecture-tabs button","\uC544\uD0A4\uD14D\uCC98 \uAD6C\uC131\uB3C4");
  await input("#architecture-diagram-select","other-arc",true);
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-architecture-canvas svg')&&!document.querySelector('.matrix-architecture-saved-image')"),"selection without image restores canvas");
  assert.equal(await evaluate("[...document.querySelectorAll('.matrix-image-actions button')].slice(1).every(button=>button.disabled)"),true);
  await input("#architecture-diagram-select","arc",true);
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-architecture-saved-image img')"),"saved image restored on selection");
  await call("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const theme of ["light","dark"]){await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);assert.equal(await evaluate("(()=>{const e=document.querySelector('.matrix-architecture-saved-image');return e.scrollWidth<=e.clientWidth+1})()"),true);await screenshot(`architecture-image-${theme}`);}
  await db.execute("UPDATE project_members SET role='viewer' WHERE user_id='B'");
  await navigate("B");
  await waitFor(()=>evaluate("!!document.querySelector('.matrix-architecture-saved-image img')&&!document.querySelector('.matrix-architecture-canvas')"),"reader sees saved image after reload");
  console.log(`PASS architecture browser: empty-image canvas, generation, saved image replaces canvas, Mermaid LR refresh, selection isolation, reader reload and narrow themes. Evidence: ${folder}`);
}catch(error){if(socket?.readyState===1)await screenshot("failure").catch(()=>{});console.error(logs.slice(-2500));console.error(`Evidence: ${folder}`);throw error;}
finally{socket?.close();stop(browser);stop(server);await new Promise(resolve=>storage.close(resolve));db.close();}
