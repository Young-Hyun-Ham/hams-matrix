// Real route handlers, authorization, SQLite migrations and encryption. Only Next's request
// cookie context and the external OpenAI provider are replaced; no paid requests are made.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import ts from "typescript";


const folder = await mkdtemp(join(tmpdir(), "matrix-project-permissions-rfp-"));
process.env.TURSO_DATABASE_URL = pathToFileURL(join(folder, "test.db")).href;
process.env.TURSO_AUTH_TOKEN = "";
process.env.OPENAI_API_KEY = "test-key";
process.env.AI_IMAGE_ENCRYPTION_KEY = Buffer.alloc(32, 71).toString("base64");
process.env.APP_URL = "http://localhost:3000";
delete process.env.OPENAI_IMAGE_MODELS;
delete process.env.OPENAI_IMAGE_MODEL;
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
const require = createRequire(import.meta.url), cache = new Map();
let token = "owner-token";
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)((request) => {
    if (request === "server-only") return {};
    if (request === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
    if (request === "next/server") return { connection: async () => {} };
    if (!request.startsWith(".") && !request.startsWith("@/")) return require(request);
    const base = request.startsWith("@/") ? resolve(request.slice(2)) : resolve(dirname(file), request);
    const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    if (!target) throw new Error(`Missing module: ${base}`);
    return load(target);
  }, loaded, loaded.exports);
  return loaded.exports;
}

try {
  for(const name of (await readdir('db/migrations')).filter(n=>n.endsWith('.sql')&&n<'030').sort())await client.executeMultiple(await readFile(join('db/migrations',name),'utf8'));
  await client.execute('PRAGMA foreign_keys=ON');
  await client.executeMultiple(`INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('owner','Owner','user',1),('admin','Admin','user',1),('member','Member','user',1),('viewer','Viewer','user',1),('outsider','Outsider','user',1);
    INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Workspace','owner');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','admin','member'),('ws','member','member'),('ws','viewer','viewer'),('ws','outsider','member');
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','ws','Project','owner','owner'),('other','ws','Other','outsider','outsider');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('p','ws','owner','admin'),('p','ws','admin','admin'),('p','ws','member','member'),('p','ws','viewer','viewer'),('other','ws','outsider','admin');
    UPDATE admin_setting SET value_json='true' WHERE setting_key='DB_LOGGING_ENABLED';`);
  const existing=(await client.execute('SELECT * FROM project_members ORDER BY project_id,user_id')).rows;
  await client.executeMultiple(await readFile('db/migrations/030_project_permissions_rfp.sql','utf8'));
  assert.deepEqual((await client.execute('SELECT * FROM project_members ORDER BY project_id,user_id')).rows,existing);
  assert.equal((await client.execute('SELECT * FROM project_role_tab_permissions')).rows.length,112);
  assert.equal((await client.execute('SELECT * FROM project_rfp_documents')).rows.length,0);
  for(const id of ['owner','admin','member','viewer','outsider'])await client.execute({sql:'INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)',args:[id,createHash('sha256').update(`${id}-token`).digest('hex'),id,'ws',new Date().toISOString(),new Date(Date.now()+3600000).toISOString()]});
  const perms=load(resolve('lib/project-permissions.ts')),model=load(resolve('lib/project-permission-model.ts'));
  const auth=load(resolve('lib/auth.ts'));
  const user=async id=>{token=`${id}-token`;return auth.requireUser();};
  const owner=await user('owner');
  await perms.initializeProjectPolicy(client,'ws','p','owner');
  await perms.initializeProjectPolicy(client,'ws','other','outsider');
  for(const role of model.projectRoles){const actor=await user(role);for(const tab of model.permissionTabs)for(const action of model.permissionActions){const allowed=model.defaultPermissions(role)[tab][action];if(allowed)await perms.requireProjectPermission(client,actor,'p',tab,action);else await assert.rejects(perms.requireProjectPermission(client,actor,'p',tab,action),e=>e.status===403);}}
  console.log('PASS: complete role x tab x CRUD matrix, workspace role separated from project role.');
  const context={params:Promise.resolve({projectId:'p'})};
  const request=(method,data)=>new Request('http://localhost:3000/api/projects/p/rfp',{method,headers:{origin:'http://localhost:3000','content-type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const api=load(resolve('app/api/projects/[projectId]/rfp/route.ts'));
  const policyApi=load(resolve('app/api/projects/[projectId]/permissions/route.ts'));
  token='owner-token';
  let policy=await (await policyApi.GET(request('GET'),context)).json();
  let changed=structuredClone(policy.permissions);changed.admin.requirement.DELETE=false;
  assert.equal((await policyApi.PATCH(request('PATCH',{expectedVersion:policy.version,permissions:changed}),context)).status,200);
  assert.equal((await policyApi.PATCH(request('PATCH',{expectedVersion:policy.version,permissions:changed}),context)).status,409);
  policy=await (await policyApi.GET(request('GET'),context)).json();
  const elevated=structuredClone(policy.permissions);elevated.member.wbs.UPDATE=true;
  assert.equal((await policyApi.PATCH(request('PATCH',{expectedVersion:policy.version,permissions:elevated}),context)).status,400);
  for(const role of ['admin','member','viewer','outsider']){token=`${role}-token`;assert.equal((await policyApi.GET(request('GET'),context)).status,403);assert.equal((await policyApi.PATCH(request('PATCH',{expectedVersion:policy.version,permissions:policy.permissions}),context)).status,403);}
  token='owner-token';
  const template=load(resolve('lib/rfp-template.ts'));
  const draft=template.createEmptyRfp('p','Project');draft.basic.background='Original background';draft.evaluation=[{id:'e1',criterion:'Quality',description:'Review',points:'30'}];
  assert.equal((await (await api.GET(request('GET'),context)).json()).document,null);
  let response=await api.POST(request('POST',{draft}),context);assert.equal(response.status,201,await response.clone().text());let doc=(await response.json()).document;
  assert.equal((await api.POST(request('POST',{draft}),context)).status,409);
  for(const role of ['admin','member','viewer']){token=`${role}-token`;assert.equal((await api.GET(request('GET'),context)).status,200);for(const method of ['POST','PATCH','DELETE'])assert.equal((await api[method](request(method,{draft,id:doc.id,expectedVersion:doc.version}),context)).status,403);}
  token='outsider-token';assert.equal((await api.GET(request('GET'),context)).status,404);token='owner-token';
  response=await api.PATCH(request('PATCH',{id:doc.id,expectedVersion:doc.version,patch:{scope:{included:'New scope'}}}),context);assert.equal(response.status,200);doc=(await response.json()).document;assert.equal(doc.draft.basic.background,'Original background');assert.equal(doc.draft.scope.included,'New scope');assert.equal(doc.draft.evaluation[0].points,'30');
  assert.equal((await api.PATCH(request('PATCH',{id:doc.id,expectedVersion:1,draft}),context)).status,409);
  assert.equal((await api.PATCH(request('PATCH',{id:doc.id,expectedVersion:doc.version,draft:{...draft,projectId:'other'}}),context)).status,400);
  assert.equal((await api.PATCH(request('PATCH',{id:doc.id,expectedVersion:doc.version,patch:{basic:{startDate:'2026-02-30'}}}),context)).status,400);
  const bad={...draft,requirements:[{id:'dupe',number:'',category:'SFR',title:'',definition:'',details:'',outputs:'',acceptance:''},{id:'dupe',number:'',category:'SFR',title:'',definition:'',details:'',outputs:'',acceptance:''}]};
  assert.equal((await api.PATCH(request('PATCH',{id:doc.id,expectedVersion:doc.version,draft:bad}),context)).status,400);
  await assert.rejects(client.execute('DELETE FROM project_rfp_revisions'));
  assert.equal((await client.execute('SELECT * FROM project_artifacts')).rows.length,0);
  console.log('PASS: RFP CRUD, shared reads, persistence, partial preservation, conflicts, validation, immutable revisions and isolation.');
  const kinds=['wbs','architecture','requirement','screen','database','program','test'];
  const artifactApi=load(resolve('app/api/projects/[projectId]/artifacts/route.ts'));
  const itemApi=load(resolve('app/api/projects/[projectId]/artifacts/[artifactId]/route.ts'));
  for(const kind of kinds)await client.execute({sql:"INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,created_by,updated_by,created_at,updated_at) VALUES (?, 'ws','p',?,?,'Permission fixture','초안','{}','owner','owner','2026-10-31','2026-10-31')",args:[`fixture-${kind}`,kind,`FIX-${kind}`]});
  const frozen=JSON.stringify((await client.execute('SELECT * FROM project_artifacts ORDER BY id')).rows);
  token='viewer-token';
  for(const kind of kinds){
    assert.equal((await artifactApi.POST(request('POST',{kind,title:'Denied',status:'초안',fields:{},links:[]}),context)).status,403,`viewer ${kind} CREATE`);
    const itemContext={params:Promise.resolve({projectId:'p',artifactId:`fixture-${kind}`})};
    assert.equal((await itemApi.PATCH(request('PATCH',{kind:'requirement',version:1,title:'Denied',status:'초안',fields:{}}),itemContext)).status,403,`viewer ${kind} UPDATE`);
    assert.equal((await itemApi.DELETE(request('DELETE',{version:1}),itemContext)).status,403,`viewer ${kind} DELETE`);
  }
  const accessApi=load(resolve('app/api/projects/[projectId]/access/route.ts'));
  const viewerAccess=await (await accessApi.GET(request('GET'),context)).json();assert.equal(viewerAccess.projectRole,'viewer');assert.equal(viewerAccess.userId,'viewer');
  for(const p of Object.values(viewerAccess.permissionsByTab)){assert.equal(p.CREATE,false);assert.equal(p.UPDATE,false);assert.equal(p.DELETE,false);}
  const mermaid=load(resolve('app/api/projects/[projectId]/artifacts/[artifactId]/mermaid/route.ts'));
  assert.equal((await mermaid.PATCH(request('PATCH',{version:1,code:'graph TD; a-->b'}),{params:Promise.resolve({projectId:'p',artifactId:'fixture-architecture'})})).status,403);
  const folderApi=load(resolve('app/api/projects/[projectId]/documents/route.ts'));
  for(const method of ['POST','PATCH','DELETE'])assert.equal((await folderApi[method](request(method,{name:'Denied',id:'anything'}),context)).status,403);
  const uploadApi=load(resolve('app/api/projects/[projectId]/documents/files/route.ts'));assert.equal((await uploadApi.POST(request('POST'),context)).status,403);
  const fileApi=load(resolve('app/api/projects/[projectId]/documents/files/[fileId]/route.ts'));
  for(const method of ['PATCH','DELETE'])assert.equal((await fileApi[method](request(method,{name:'Denied'}),{params:Promise.resolve({projectId:'p',fileId:'anything'})})).status,403);
  assert.equal(JSON.stringify((await client.execute('SELECT * FROM project_artifacts ORDER BY id')).rows),frozen);
  token='admin-token';
  for(const kind of kinds.filter(k=>k!=='wbs'&&k!=='architecture')){
    await client.execute({sql:"UPDATE project_role_tab_permissions SET can_create=0,can_update=0,can_delete=0 WHERE project_id='p' AND role='admin' AND tab_key=?",args:[kind]});
    assert.equal((await artifactApi.POST(request('POST',{kind,title:'Denied',status:'초안',fields:{}}),context)).status,403,`unchecked admin ${kind} CREATE`);
    const target={params:Promise.resolve({projectId:'p',artifactId:`fixture-${kind}`})};
    assert.equal((await itemApi.PATCH(request('PATCH',{version:1,kind,title:'Denied',status:'초안',fields:{}}),target)).status,403,`unchecked admin ${kind} UPDATE`);
    assert.equal((await itemApi.DELETE(request('DELETE',{version:1}),target)).status,403,`unchecked admin ${kind} DELETE`);
    await client.execute({sql:"UPDATE project_role_tab_permissions SET can_create=1,can_update=1,can_delete=? WHERE project_id='p' AND role='admin' AND tab_key=?",args:[kind==='requirement'?0:1,kind]});
  }
  await client.execute("DELETE FROM project_role_tab_permissions WHERE project_id='p' AND role='admin' AND tab_key='screen'");
  await assert.rejects(perms.requireProjectPermission(client,await user('admin'),'p','screen','CREATE'),e=>e.status===403);
  await perms.initializeProjectPolicy(client,'ws','p','owner');
  await client.execute("DELETE FROM project_artifacts WHERE id LIKE 'fixture-%'");token='owner-token';
  console.log('PASS: every artifact API rejects viewer C/U/D, Mermaid and folder/file mutations blocked, unchecked admin actions rejected, missing policy rows fail closed.');
  // Actual agent tools and final transaction; external model is unnecessary for these checks.
  const {createPageAgent}=load(resolve('lib/ai/page-tools.ts'));
  const page=load(resolve('lib/ai/page-prompts.ts')).aiPages.rfp;
  const aiContext={projectId:'p',projectName:'Project',tab:'rfp',pathname:'/projects/p',screen:'Project'};
  const pendingAgent=createPageAgent(request('POST'),owner,aiContext,page,true,'제안요청서 배경을 수정해줘');
  const result=await pendingAgent.execute('save_rfp_document',{action:'UPDATE',id:doc.id,expectedVersion:doc.version,patch:{basic:{background:'AI background'}}});assert.equal(result.pending,true,JSON.stringify(result));
  assert.equal((await (await api.GET(request('GET'),context)).json()).document.draft.basic.background,'Original background');
  let tx=await client.transaction('write');let committed;try{committed=await pendingAgent.commit(tx);await tx.commit();}finally{tx.close();}assert.equal(committed[0].target,'rfp');
  doc=(await (await api.GET(request('GET'),context)).json()).document;assert.equal(doc.draft.basic.background,'AI background');assert.equal(doc.draft.scope.included,'New scope');
  const denied=createPageAgent(request('POST'),owner,aiContext,page,true,'저장하지 말고 초안만 작성해줘');assert.equal((await denied.execute('save_rfp_document',{action:'UPDATE',id:doc.id,expectedVersion:doc.version,patch:{title:'Denied'}})).success,false);
  const reader=createPageAgent(request('POST'),await user('viewer'),aiContext,page,false,'조회해줘');assert.equal(reader.tools.some(t=>t.name==='save_rfp_document'),false);assert.equal((await reader.execute('read_page',{})).success,true);assert.equal((await reader.execute('save_rfp_document',{action:'DELETE'})).status,403);
  token='owner-token';const revoked=createPageAgent(request('POST'),owner,aiContext,page,true,'제안요청서 배경을 수정해줘');assert.equal((await revoked.execute('save_rfp_document',{action:'UPDATE',id:doc.id,expectedVersion:doc.version,patch:{basic:{background:'Must not save'}}})).pending,true);
  await client.execute("UPDATE projects SET owner_id='admin' WHERE id='p'");tx=await client.transaction('write');try{await assert.rejects(revoked.commit(tx),e=>e.status===403);}finally{await tx.rollback();tx.close();}await client.execute("UPDATE projects SET owner_id='owner' WHERE id='p'");
  assert.equal((await (await api.GET(request('GET'),context)).json()).document.draft.basic.background,'AI background');
  assert.equal((await api.DELETE(request('DELETE',{id:doc.id,expectedVersion:doc.version}),context)).status,200);
  const creator=createPageAgent(request('POST'),owner,aiContext,page,true,'제안요청서를 작성해줘');assert.equal((await creator.execute('save_rfp_document',{action:'CREATE',draft})).pending,true);tx=await client.transaction('write');try{await creator.commit(tx);await tx.commit();}finally{tx.close();}
  assert.equal((await client.execute('SELECT * FROM project_rfp_documents WHERE deleted_at IS NULL')).rows.length,1);
  console.log('PASS: real RFP agent preview rollback, final commit, text-only request, viewer tools, revocation at commit, create intent and no duplicate active documents.');
  // Direct alternate mutation paths must respect the same policy.
  const member=await user('member');
  const wbs=load(resolve('lib/wbs-schedule-server.ts'));
  await assert.rejects(wbs.saveWbsSchedule(request('POST'),member,'p',{requestId:crypto.randomUUID(),changes:[{id:'temp-task',title:'Blocked',status:'초안',fields:{}}],deletes:[]}),e=>e.status===403);
  const folders=load(resolve('app/api/projects/[projectId]/documents/route.ts'));token='viewer-token';assert.equal((await folders.POST(request('POST',{name:'Blocked'}),context)).status,403);
  const art=load(resolve('lib/artifacts.ts'));await assert.rejects(art.mutateArtifact(request('POST'),member,'p',{kind:'architecture'},'CREATE'),e=>e.status===403);
  const images=load(resolve('lib/ai/wbs-images.ts'));await assert.rejects(images.wbsFor(client,member,'p',true),e=>e.status===403);
  const requirement=await art.mutateArtifact(request('POST'),owner,'p',{kind:'requirement',title:'Deletion policy',status:'초안',fields:{category:'SFR',definition:'Requirement',details:'Details',priority:'중'},links:[]},'CREATE');
  await assert.rejects(art.mutateArtifact(request('DELETE'),await user('admin'),'p',{version:requirement.version},'DELETE',requirement.id),e=>e.status===403);
  await art.mutateArtifact(request('DELETE'),owner,'p',{version:requirement.version},'DELETE',requirement.id);
  token='owner-token';doc=(await (await api.GET(request('GET'),context)).json()).document;
  await client.execute("CREATE TRIGGER test_rfp_rollback BEFORE INSERT ON project_rfp_revisions BEGIN SELECT RAISE(ABORT,'test revision failure'); END");
  assert.equal((await api.PATCH(request('PATCH',{id:doc.id,expectedVersion:doc.version,patch:{title:'Must roll back'}}),context)).status,500);
  assert.equal((await (await api.GET(request('GET'),context)).json()).document.version,doc.version);
  assert.equal((await (await api.GET(request('GET'),context)).json()).document.draft.title,doc.draft.title);
  await client.execute('DROP TRIGGER test_rfp_rollback');
  await client.execute("UPDATE admin_setting SET value_json='false' WHERE setting_key='DB_LOGGING_ENABLED'");token='owner-token';const count=(await client.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n;
  doc=(await (await api.GET(request('GET'),context)).json()).document;assert.equal((await api.PATCH(request('PATCH',{id:doc.id,expectedVersion:doc.version,patch:{title:'Logging disabled'}}),context)).status,200);assert.equal((await client.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n,count);
  assert.deepEqual((await client.execute('PRAGMA foreign_key_check')).rows,[]);
  console.log('PASS: alternate WBS/artifact/image/file mutation denial, audit toggle, and foreign key integrity.');
  token='owner-token';await client.execute("UPDATE user_subscriptions SET plan_code='business' WHERE user_id='owner'");
  const projects=load(resolve('app/api/projects/route.ts'));
  response=await projects.POST(request('POST',{name:'New project',description:'',memberIds:['outsider']}));assert.equal(response.status,201,await response.clone().text());
  const created=(await response.json()).project;assert.equal(created.members.find(m=>m.id==='owner').role,'owner');assert.equal(created.members.find(m=>m.id==='outsider').role,'viewer');
  assert.equal((await client.execute({sql:'SELECT COUNT(*) AS n FROM project_role_tab_permissions WHERE project_id=?',args:[created.id]})).rows[0].n,56);
  await client.execute("UPDATE users SET email='outsider@example.test' WHERE id='outsider'");
  const team=load(resolve('app/api/team/members/route.ts'));
  assert.equal((await team.POST(request('POST',{projectId:'p',email:'outsider@example.test'}))).status,201);
  assert.equal((await client.execute("SELECT role FROM project_members WHERE project_id='p' AND user_id='outsider'")).rows[0].role,'viewer');
  assert.equal((await team.PATCH(request('PATCH',{projectId:'p',userId:'admin',role:'owner',expectedOwnerId:'owner',confirmTransfer:true}))).status,200);
  assert.equal((await policyApi.GET(request('GET'),context)).status,403);token='admin-token';assert.equal((await policyApi.GET(request('GET'),context)).status,200);
  assert.equal((await client.execute("SELECT role FROM project_members WHERE project_id='p' AND user_id='owner'")).rows[0].role,'member');
  assert.equal((await client.execute("SELECT account_role FROM users WHERE id='admin'")).rows[0].account_role,'user');
  assert.equal((await client.execute("SELECT owner_id FROM projects WHERE id='other'")).rows[0].owner_id,'outsider');
  console.log('PASS: new project viewer default, default policy creation, direct invite viewer, atomic role transfer and account/other-project isolation.');
  await client.execute("INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('applicant','Applicant','user',1)");
  await client.execute("INSERT INTO team_join_requests(id,workspace_id,user_id) VALUES ('join-new','ws','applicant'),('join-existing','ws','viewer')");
  const requests=load(resolve('app/api/team/requests/route.ts'));token='owner-token';
  assert.equal((await requests.PATCH(request('PATCH',{id:'join-new',status:'approved'}))).status,200);
  assert.equal((await client.execute("SELECT role FROM workspace_members WHERE user_id='applicant' AND workspace_id='ws'")).rows[0].role,'viewer');
  assert.equal((await client.execute("SELECT * FROM project_members WHERE user_id='applicant'")).rows.length,0);
  assert.equal((await requests.PATCH(request('PATCH',{id:'join-existing',status:'approved'}))).status,200);
  assert.equal((await client.execute("SELECT role FROM project_members WHERE user_id='viewer' AND project_id='p'")).rows[0].role,'viewer');
  console.log('PASS: team approval defaults to viewer, never auto-enrolls projects, and never auto-promotes existing project viewers.');
} finally {load(resolve('lib/db.ts')).db().close();client.close();}

