import {checkNavigationSettings} from "./check-navigation-settings.mjs";
// Isolated SQLite and HTTP integration tests. Never reads .env or calls a paid provider.
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { bootstrapMaster } from "./lib/bootstrap-master.mjs";
const folder=await mkdtemp(join(tmpdir(),"matrix-accounts-")),url=pathToFileURL(join(folder,"test.db")).href;
const db=createClient({url,timeout:5000});let server,logs="";
await db.execute("PRAGMA journal_mode=WAL");
const origin="http://localhost:3236";
const request=(path,{cookie,method="GET",data}={})=>fetch(origin+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(method!=="GET"?{Origin:origin,"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(60000)});
async function json(path,options,status=200){const response=await request(path,options);const text=await response.text();assert.equal(response.status,status,`${path}: ${text.slice(0,1000)}`);return {data:JSON.parse(text),cookie:response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ")};}
const one=async(sql,args=[]) => (await db.execute({sql,args})).rows[0];
try {
  const files=(await readdir("db/migrations")).filter(name=>name.endsWith(".sql")).sort();
  for(const name of files.filter(name=>name<"020"))await db.executeMultiple(await readFile(join("db/migrations",name),"utf8"));
  await db.execute("INSERT INTO users(id,name,account_role) VALUES ('legacy','Legacy','owner')");
  const settings=JSON.stringify((await db.execute("SELECT * FROM app_settings")).rows);
  await db.executeMultiple("BEGIN IMMEDIATE;\n"+await readFile("db/migrations/020_accounts_and_plans.sql","utf8")+"\nCOMMIT;");
  for (const name of files.filter(name=>name>"020_accounts_and_plans.sql")) await db.executeMultiple(await readFile(join("db/migrations",name),"utf8"));
  assert.equal((await one("SELECT account_role FROM users WHERE id='legacy'")).account_role,"user");
  assert.equal((await one("SELECT plan_code FROM user_subscriptions WHERE user_id='legacy'")).plan_code,"free");
  assert.equal(JSON.stringify((await db.execute("SELECT * FROM app_settings")).rows),settings);
  await assert.rejects(db.execute("UPDATE users SET account_role='owner' WHERE id='legacy'"));
  const password="TestMaster123!";
  assert.equal((await bootstrapMaster(db,password)).created,true);
  const hash=(await one("SELECT password_hash FROM users WHERE account_role='master'")).password_hash;
  assert.notEqual(hash,password);assert.ok(String(hash).startsWith("scrypt:"));
  assert.equal((await bootstrapMaster(db,password)).created,false);
  await assert.rejects(bootstrapMaster(db,"different-password"));
  assert.equal((await one("SELECT password_hash FROM users WHERE account_role='master'")).password_hash,hash);
  await assert.rejects(db.execute("INSERT INTO users(id,name,account_role) VALUES ('other','Other','master')"));
  await assert.rejects(db.execute("DELETE FROM users WHERE account_role='master'"));
  await assert.rejects(db.execute("UPDATE users SET account_role='user' WHERE account_role='master'"));
  assert.equal((await one("SELECT count(*) AS count FROM plans")).count,4);
  assert.equal((await one("SELECT token_limit FROM plans WHERE code='plus'")).token_limit,1000000);
  assert.equal((await one("SELECT yearly_price FROM plans WHERE code='plus'")).yearly_price,null);
  assert.equal((await one("SELECT project_limit FROM plans WHERE code='business'")).project_limit,null);
  assert.equal((await db.execute("PRAGMA foreign_key_check")).rows.length,0);
  console.log("PASS: migration preserves settings, account constraints, default subscriptions, master uniqueness/immutability, bootstrap idempotency, plan defaults and foreign keys");
  if(!process.argv.includes("--db-only")) {
    server=spawn(process.execPath,["--import",pathToFileURL(resolve("scripts/ai-test-provider.mjs")).href,resolve("node_modules/next/dist/bin/next"),"start","--port","3236"],{windowsHide:true,env:{...process.env,TURSO_DATABASE_URL:url,TURSO_AUTH_TOKEN:"",APP_URL:origin,OPENAI_API_KEY:"test-secret-key",OPENAI_MODELS:"gpt-5.6-sol",MATRIX_AI_TEST:"1",AI_IMAGE_ENCRYPTION_KEY:Buffer.alloc(32,66).toString("base64"),NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});
    server.stdout.on("data",data=>logs+=data);server.stderr.on("data",data=>logs+=data);
    for(let attempt=0;attempt<150;attempt++){try{if((await request("/login")).ok)break;}catch{}if(attempt===149)throw new Error(logs);await new Promise(resolve=>setTimeout(resolve,200));}
    const loginPage=await (await request("/login")).text();assert.ok(loginPage.includes("게스트로 시작하기"));assert.ok(loginPage.includes("회원등록"));
    const signupPage=await (await request("/signup")).text();assert.ok(!signupPage.includes("가입 역할"));
    for(const page of ["dashboard","team","ai","project","project/requirement"]){const response=await request(`/guest/${page}`);assert.equal(response.status,200);assert.ok((await response.text()).includes("게스트 체험"));}
    await json("/api/projects",{},401);
    const master=(await json("/api/auth/login",{method:"POST",data:{email:"master@hamsfam.co.kr",password}})).cookie;
    const create=async(email)=>json("/api/auth/signup",{method:"POST",data:{email,name:"Test User",password:"UserPassword123!",accepted:true}},201);
    await json("/api/auth/signup",{method:"POST",data:{email:"forged@example.test",name:"Forged",password:"UserPassword123!",accepted:true,role:"master"}},400);
    const first=await create("first@example.test"),second=await create("second@example.test"), user=first.data.user;
    assert.equal(user.accountRole,"user");assert.equal(user.plan,"free");assert.equal(user.role,"owner");
    await json("/api/admin/plans",{cookie:first.cookie},403);
    const createProject=async(cookie,name,status=201)=>json("/api/projects",{cookie,method:"POST",data:{name,description:"Test",memberIds:[]}},status);
    const project=(await createProject(first.cookie,"Project One")).data.project;assert.equal(project.ownerId,user.id);assert.equal(project.members[0].role,"owner");
    await createProject(first.cookie,"Over Limit",403);
    let catalog=(await json("/api/admin/plans",{cookie:master})).data.plans;let plus=catalog.find(plan=>plan.code==="plus");
    await json("/api/admin/plans",{cookie:master,method:"PATCH",data:{...plus,yearlyPrice:100000}},200);
    await json("/api/admin/plans",{cookie:master,method:"PATCH",data:{...plus,yearlyPrice:90000}},409);
    await json("/api/admin/members",{cookie:master,method:"PATCH",data:{userId:user.id,plan:"plus",version:1}});
    await Promise.all([createProject(first.cookie,"Project Two"),createProject(first.cookie,"Project Three")]);
    await createProject(first.cookie,"Fourth",403);
    const post=await json("/api/team/posts",{cookie:first.cookie,method:"POST",data:{projectId:project.id,title:"Owner post",body:"Allowed",category:"공유"}},201);
    assert.ok(post.data.id);
    await json("/api/team/members",{cookie:first.cookie,method:"POST",data:{projectId:project.id,email:second.data.user.email}},201);
    const spaces=(await json("/api/me/workspace",{cookie:second.cookie})).data;assert.equal(spaces.current,second.data.user.workspaceId);
    await json("/api/me/workspace",{cookie:second.cookie,method:"PATCH",data:{workspaceId:user.workspaceId}});
    await json("/api/team/posts",{cookie:second.cookie,method:"POST",data:{projectId:project.id,title:"Viewer post",body:"Blocked",category:"공유"}},403);
    await json("/api/team/members",{cookie:first.cookie,method:"PATCH",data:{projectId:project.id,userId:second.data.user.id,role:"member",expectedRole:"viewer"}});
    await json("/api/team/posts",{cookie:second.cookie,method:"POST",data:{projectId:project.id,title:"Member post",body:"Allowed",category:"공유"}},201);
    await json("/api/team/members",{cookie:second.cookie,method:"PATCH",data:{projectId:project.id,userId:user.id,role:"viewer",expectedRole:"owner"}},403);
    const free=await create("free@example.test");
    const room=(await json("/api/ai/conversations",{cookie:free.cookie,method:"POST",data:{projectId:""}},201)).data.conversation;
    assert.ok(room.convId.startsWith("temporary-"));assert.equal(Number((await one("SELECT count(*) AS count FROM ai_conversations WHERE user_id=?",[free.data.user.id])).count),0);
    const generation={requestId:crypto.randomUUID(),convId:room.convId,prompt:"[UI] Show an example",model:"gpt-5.6-sol",pathname:"/dashboard",projectId:"",tab:null};
    const response=await json("/api/ai/chats",{cookie:free.cookie,method:"POST",data:generation});assert.ok(response.data.chat.result);
    assert.equal(Number((await one("SELECT count(*) AS count FROM ai_prompt_chats WHERE user_id=?",[free.data.user.id])).count),0);
    assert.equal(Number((await one("SELECT SUM(actual) AS used FROM quota_reservations WHERE user_id=? AND resource='tokens'",[free.data.user.id])).used),140);
    await db.execute({sql:"UPDATE plans SET token_limit=140 WHERE code='free'",args:[]});
    await json("/api/ai/chats",{cookie:free.cookie,method:"POST",data:{...generation,requestId:crypto.randomUUID()}},403);
    assert.equal((await db.execute("PRAGMA foreign_key_check")).rows.length,0);
    await checkNavigationSettings({json,request,db,master,first,second});
    console.log("PASS: login/signup/guest, forged role rejection, project limits/concurrency, plan version conflicts, owner/member/viewer authorization, workspace switching, Free ephemeral AI and token quota");
  }
}catch(error){console.error(logs.slice(-5000));throw error;}finally{
  if(server?.pid){if(process.platform==="win32")spawnSync("taskkill",["/pid",String(server.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});else server.kill("SIGTERM");}
  db.close();
}
