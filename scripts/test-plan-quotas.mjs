import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import ts from "typescript";
const folder=await mkdtemp(join(tmpdir(),"matrix-quotas-"));
process.env.TURSO_DATABASE_URL=pathToFileURL(join(folder,"test.db")).href;process.env.TURSO_AUTH_TOKEN="";
const db=createClient({url:process.env.TURSO_DATABASE_URL});const require=createRequire(import.meta.url),cache=new Map();
function load(file){if(cache.has(file))return cache.get(file).exports;const loaded={exports:{}};cache.set(file,loaded);const code=ts.transpileModule(readFileSync(file,"utf8"),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;new Function("require","module","exports",code)(request=>{if(request==="server-only")return {};if(request==="next/headers")return {cookies:async()=>({get:()=>undefined})};if(request==="next/server")return {connection:async()=>{}};if(!request.startsWith(".")&&!request.startsWith("@/"))return require(request);const base=request.startsWith("@/")?resolve(request.slice(2)):resolve(dirname(file),request);const target=[base,`${base}.ts`].find(existsSync);if(!target)throw new Error(base);return load(target);},loaded,loaded.exports);return loaded.exports;}
try {
 for(const name of (await readdir("db/migrations")).filter(name=>name.endsWith(".sql")).sort())await db.executeMultiple(await readFile(join("db/migrations",name),"utf8"));
 await db.executeMultiple("INSERT INTO users(id,name) VALUES ('one','One'),('two','Two');");
 const quota=load(resolve("lib/quotas.ts")),plans=load(resolve("lib/plans.ts")),images=load(resolve("lib/ai/chat-images.ts"));
 assert.notEqual(quota.quotaPeriod("images",new Date("2026-10-28T14:59:59Z")),quota.quotaPeriod("images",new Date("2026-10-28T15:00:00Z")));
 assert.equal(quota.quotaPeriod("tokens",new Date("2026-01-01")),quota.quotaPeriod("tokens",new Date("2027-01-01")));
 const results=await Promise.allSettled([quota.reserveQuota("one","image-1","images",1),quota.reserveQuota("one","image-2","images",1)]);
 assert.equal(results.filter(result=>result.status==="fulfilled").length,1);
 const winningId=results[0].status==="fulfilled"?"image-1":"image-2";
 await quota.releaseQuota(winningId);await quota.reserveQuota("one","image-3","images",1);await quota.settleQuota("image-3",1);await quota.settleQuota("image-3",1);
 await assert.rejects(quota.reserveQuota("one","image-4","images",1));
 await quota.reserveQuota("one","tokens-1","tokens",99999);await assert.rejects(quota.reserveQuota("one","tokens-2","tokens",2));
 await quota.settleQuota("tokens-1",100);await quota.reserveQuota("one","tokens-3","tokens",99900);await assert.rejects(quota.reserveQuota("one","tokens-3","tokens",1));
 await db.execute("UPDATE user_subscriptions SET plan_code='plus' WHERE user_id='one'");await quota.reserveQuota("one","tokens-4","tokens",1);
 await db.execute("UPDATE user_subscriptions SET plan_code='free' WHERE user_id='one'");await assert.rejects(quota.reserveQuota("one","tokens-5","tokens",1));
 await db.execute("UPDATE user_subscriptions SET plan_code='business' WHERE user_id='two'");await quota.reserveQuota("two","unlimited","tokens",100000000);
 const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQIoAAAAASUVORK5CYII=";
 const attachment={dataUrl:`data:image/png;base64,${png}`};
 for(const code of ["free","plus","pro","business"]){await db.execute({sql:"UPDATE user_subscriptions SET plan_code=? WHERE user_id='two'",args:[code]});const plan=await plans.memberPlan("two");assert.equal(images.validateAiImages(Array(plan.attachmentLimit).fill(attachment),plan.attachmentLimit).length,plan.attachmentLimit);assert.throws(()=>images.validateAiImages(Array(plan.attachmentLimit+1).fill(attachment),plan.attachmentLimit));}
 await db.executeMultiple("INSERT INTO users(id,name) VALUES ('tracker','Tracker'); INSERT INTO workspaces(id,name) VALUES ('tracker-ws','Tracker'); UPDATE user_subscriptions SET plan_code='business' WHERE user_id='tracker';");
 const {createTokenTracker}=load(resolve("lib/ai/token-usage.ts"));
 const makeTracker=requestId=>createTokenTracker({workspaceId:"tracker-ws",userId:"tracker",projectId:"",projectName:"",convId:"test",conversationTitle:"Test",chatId:requestId,requestId,model:"test",prompt:"Test"});
 const track=makeTracker("first");
 await track({turn:0,status:"started",reservedTokens:1000});
 await track({turn:0,status:"in_progress",responseId:"shared-response",usage:{input_tokens:80,output_tokens:10,total_tokens:90}});
 await track({turn:0,status:"cancelled",responseId:"shared-response"});
 assert.equal((await db.execute("SELECT status FROM quota_reservations WHERE id='first:0'")).rows[0].status,"reserved","interim usage cannot release the remaining budget when final usage is unknown");
 await track({turn:0,status:"cancelled",responseId:"shared-response",usage:{input_tokens:80,output_tokens:20,total_tokens:100}});
 const secondTrack=makeTracker("second");await secondTrack({turn:0,status:"started",reservedTokens:1000});await secondTrack({turn:0,status:"completed",responseId:"shared-response",usage:{input_tokens:80,output_tokens:20,total_tokens:100}});
 assert.equal(Number((await db.execute("SELECT SUM(actual) AS used FROM quota_reservations WHERE user_id='tracker'")).rows[0].used),100,"provider response deduplication must also deduplicate the quota ledger");
 const unknown=makeTracker("unknown");await unknown({turn:0,status:"started",reservedTokens:1000});await unknown({turn:0,status:"failed"});
 assert.equal((await db.execute("SELECT status FROM quota_reservations WHERE id='unknown:0'")).rows[0].status,"reserved");
 await db.execute("DELETE FROM quota_reservations WHERE id='first:0'");
 const backfill=await readFile("db/migrations/021_backfill_token_quota.sql","utf8");await db.executeMultiple(backfill);await db.executeMultiple(backfill);
 assert.equal(Number((await db.execute("SELECT actual FROM quota_reservations WHERE id='first:0'")).rows[0].actual),100);
 assert.equal(Number((await db.execute("SELECT count(*) AS count FROM quota_reservations WHERE id='first:0'")).rows[0].count),1);
 assert.equal((await db.execute("PRAGMA foreign_key_check")).rows.length,0);
 console.log("PASS: concurrent daily quotas, reservations, idempotent settlement, duplicate requests, release, lifetime tokens, plan changes without reset, unlimited quota, KST midnight, per-plan image attachments");
 console.log("PASS: pending final usage retains reservations, provider usage is deduplicated, and existing token usage backfill is idempotent");
 const {generateAi}=load(resolve("lib/ai-server.ts"));
 const originalFetch=globalThis.fetch;
 try {
   globalThis.fetch=async()=>Response.json({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"OK"}]}]});
   const literal="data:image/png;base64,"+"A".repeat(20000);let reserved=0;
   await generateAi("test","",JSON.stringify({request:literal}),undefined,[],[],async event=>{if(event.status==="started")reserved=event.reservedTokens;});
   assert.ok(reserved>literal.length+6000,"a data URI inside ordinary text must be included in the text budget, not stripped as an image attachment");
   console.log("PASS: text that resembles an image URI cannot bypass the token reservation budget");
 } finally { globalThis.fetch=originalFetch; }
}finally{db.close();for(const [file,module] of cache)if(file.endsWith(`${process.platform==='win32'?'\\':'/'}db.ts`))module.exports.db().close();}
