// Real route handlers and database; replace only Next request cookies and the external S3 service.
import assert from "node:assert/strict";
import { checkRfpGenerationScope } from "./check-rfp-generation-scope.mjs";
import { checkRfpGenerationHistory } from "./check-rfp-generation-history.mjs";
import { checkWbsRfpContext } from "./check-wbs-rfp-context.mjs";
import { checkGuardrailChangeLimit } from "./check-guardrail-change-limit.mjs";
import { checkAiTargets } from "./check-ai-targets.mjs";
import { checkAiToolExecution } from "./check-ai-tool-execution.mjs";
import { checkDatabaseDomains } from "./check-database-domains.mjs";
import { checkDatabaseErdImages } from "./check-database-erd-images.mjs";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import ts from "typescript";


const directory = await mkdtemp(join(tmpdir(), "matrix-rfp-source-"));
process.env.TURSO_DATABASE_URL = pathToFileURL(join(directory, "test.db")).href;
process.env.TURSO_AUTH_TOKEN = "";
process.env.APP_URL = "http://localhost:3000";
Object.assign(process.env, { R2_ENDPOINT: "https://test.r2.cloudflarestorage.com", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test", R2_BUCKET_NAME: "private-test" });
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
const require = createRequire(import.meta.url), cache = new Map(), objects = new Map();
let token = "owner-token", failStorage = false, onPut;
class PutObjectCommand { constructor(input) { this.input = input; } }
class GetObjectCommand extends PutObjectCommand {}
class DeleteObjectCommand extends PutObjectCommand {}
class S3Client {
  constructor(config) { assert.equal(config.region, "auto"); }
  destroy() {}
  async send(command) {
    const input = command.input;
    assert.equal(input.Bucket, "private-test");
    if (failStorage) throw new Error("StorageUnavailable");
    if (command instanceof GetObjectCommand) {
      assert.ok(objects.has(input.Key));
      return { Body: { transformToByteArray: async () => objects.get(input.Key) } };
    }
    if (command instanceof DeleteObjectCommand) { objects.delete(input.Key); return {}; }
    objects.set(input.Key, input.Body);
    if (onPut) await onPut();
    return {};
  }
}
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} }; cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)((request) => {
    if (request === "server-only") return {};
    if (request === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
    if (request === "next/server") return { connection: async () => {} };
    if (request === "@aws-sdk/client-s3") return { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
    if (!request.startsWith(".") && !request.startsWith("@/")) return require(request);
    const base = request.startsWith("@/") ? resolve(request.slice(2)) : resolve(dirname(file), request);
    const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
    if (!target) throw new Error(`Missing module: ${base}`);
    return load(target);
  }, loaded, loaded.exports);
  return loaded.exports;
}

const originalFetch=globalThis.fetch;
let calls=0,afterGenerate,complete=true,invalid=false,lastAiRequest;
process.env.OPENAI_API_KEY="synthetic-rfp-key";
process.env.OPENAI_MODELS="gpt-5.6-sol";
try {
  for(const name of (await readdir("db/migrations")).filter(name=>name.endsWith(".sql")).sort())await client.executeMultiple(await readFile(join("db/migrations",name),"utf8"));
  await client.execute("PRAGMA foreign_keys=ON");
  await client.executeMultiple(`INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('owner','Owner','user',1),('reader','Reader','user',1),('admin','Admin','user',1),('outsider','Outsider','user',1);
    INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Workspace','owner'),('other','Other','outsider');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','reader','viewer'),('ws','admin','member'),('other','outsider','owner');
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('project','ws','Project','owner','owner'),('second','ws','Second','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('project','ws','owner','admin'),('project','ws','reader','viewer'),('project','ws','admin','admin'),('second','ws','owner','admin');
    UPDATE user_subscriptions SET plan_code='business'; UPDATE admin_setting SET value_json='true' WHERE setting_key='DB_LOGGING_ENABLED';`);
  for(const [id,ws]of[["owner","ws"],["reader","ws"],["admin","ws"],["outsider","other"]])await client.execute({sql:"INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",args:[id,createHash("sha256").update(`${id}-token`).digest("hex"),id,ws,new Date().toISOString(),new Date(Date.now()+3600000).toISOString()]});
  const source=load(resolve("app/api/projects/[projectId]/rfp/source/route.ts"));
  const generate=load(resolve("app/api/projects/[projectId]/rfp/generate/route.ts"));
  const status=load(resolve("app/api/projects/[projectId]/rfp/generate/[requestId]/route.ts"));
  const stop=load(resolve("app/api/projects/[projectId]/rfp/generate/[requestId]/stop/route.ts"));
  const files=load(resolve("app/api/projects/[projectId]/documents/files/[fileId]/route.ts"));
  const listing=load(resolve("app/api/projects/[projectId]/documents/route.ts"));
  const rfp=load(resolve("app/api/projects/[projectId]/rfp/route.ts"));
  const template=load(resolve("lib/rfp-template.ts"));
  const ctx=(projectId="project",extra={})=>({params:Promise.resolve({projectId,...extra})});
  const request=(method,input,url="http://localhost:3000/test")=>new Request(url,{method,headers:{origin:process.env.APP_URL,"Content-Type":"application/json"},...(input===undefined?{}:{body:JSON.stringify(input)})});
  const upload=(method="POST",version=0,name="source.txt",text="A project for source based generation.",projectId="project")=>source[method](new Request(`http://localhost:3000/source?${new URLSearchParams({name,expectedSourceVersion:String(version)})}`,{method,headers:{origin:process.env.APP_URL},body:text}),ctx(projectId));
  const readSource=async()=>{const response=await source.GET(request("GET"),ctx());assert.equal(response.status,200,await response.clone().text());return(await response.json()).source;};
  const readDocument=async()=> (await(await rfp.GET(request("GET"),ctx())).json()).document;
  const detach=version=>source.DELETE(request("DELETE",{expectedSourceVersion:version}),ctx());
  const remove=id=>files.DELETE(request("DELETE"),ctx("project",{fileId:id}));
  const inputFor=async()=>{const s=await readSource(),doc=await readDocument();return{requestId:crypto.randomUUID(),sourceFileId:s.file.id,expectedSourceVersion:s.version,model:"gpt-5.6-sol",documentId:doc?.id??null,expectedVersion:doc?.version??null};};
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),"https://api.openai.com/v1/responses");calls++;
    const body=JSON.parse(options.body);lastAiRequest=body;assert.equal(body.text.format.name,"rfp_from_source");assert.ok(!body.tools);assert.ok(body.input.includes("untrustedSourceText"));
    const draft=template.createEmptyRfp("");draft.title="Generated from file";draft.basic.background="Source background";draft.requirements=[{id:"placeholder",number:"SFR-001",category:"SFR",title:"Source requirement",definition:"",details:"Keep source details",outputs:"",acceptance:""}];
    if(invalid)draft.basic.startDate="2026-02-30";
    if(afterGenerate)await afterGenerate();
    return Response.json({id:`synthetic-rfp-${calls}`,status:"completed",model:"gpt-5.6-sol",usage:{input_tokens:20,output_tokens:40,total_tokens:60},output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({complete,document:draft})}]}]});
  };
  if(process.argv.includes("--database-erd-only")){
    await checkDatabaseErdImages({load,client,setToken:value=>{token=value;}});
  }else if(process.argv.includes("--database-domains-only")){
    await checkDatabaseDomains({load,client,setToken:value=>{token=value;}});
  }else if(process.argv.includes("--tool-execution-only")){
    await checkAiToolExecution({load,client});
  }else if(process.argv.includes("--targets-only")){
    await checkAiTargets({load,client,setToken:value=>{token=value;}});
  }else if(process.argv.includes("--change-limit-only")){
    await checkGuardrailChangeLimit({load});
  }else if(process.argv.includes("--wbs-context-only")){
    await checkWbsRfpContext({load,client,setToken:value=>{token=value;}});
  }else if(process.argv.includes("--history-only")){
    await checkRfpGenerationHistory({upload,inputFor,generate,request,ctx,client,setToken:value=>{token=value;}});
  }else if(process.argv.includes("--scope-only")){
    await checkRfpGenerationScope({upload,inputFor,generate,request,ctx,readDocument,client,getAiRequest:()=>lastAiRequest,getCalls:()=>calls,setToken:value=>{token=value;}});
  }else{
  token="";assert.equal((await source.GET(request("GET"),ctx())).status,401);
  for(const actor of["reader","admin"]){token=`${actor}-token`;assert.equal((await upload()).status,403);}
  token="outsider-token";assert.equal((await source.GET(request("GET"),ctx())).status,404);token="owner-token";
  assert.equal((await upload("POST",0,"bad.hwp")).status,400);
  assert.equal((await upload("POST",0,"fake.pdf")).status,400);
  assert.equal((await upload("POST",0,"empty.txt","")).status,400);
  assert.equal((await upload("POST",0,"big.txt","x".repeat(20*1024*1024+1))).status,413);
  assert.equal((await upload("POST",0,"long.txt","x".repeat(100001))).status,400);
  let response=await upload();assert.equal(response.status,201,await response.clone().text());
  let s=await readSource();const first=s.file.id;
  assert.equal((await upload()).status,409);
  let list=await(await listing.GET(request("GET"),ctx())).json();assert.equal(list.files[0].id,first);assert.equal(list.files[0].rfpSource,true);
  response=await files.GET(request("GET"),ctx("project",{fileId:first}));assert.equal(response.status,200);assert.equal(await response.text(),"A project for source based generation.");
  assert.equal((await remove(first)).status,409);
  token="admin-token";assert.equal((await files.PATCH(request("PATCH",{name:"renamed.txt"}),ctx("project",{fileId:first}))).status,403);token="owner-token";
  assert.equal((await files.PATCH(request("PATCH",{name:"renamed.docx"}),ctx("project",{fileId:first}))).status,400);
  let input=await inputFor();response=await generate.POST(request("POST",input),ctx());assert.equal(response.status,200,await response.clone().text());
  let result=await response.json();assert.equal(result.generation.status,"completed");assert.equal(result.document.version,1);assert.notEqual(result.document.draft.requirements[0].id,"placeholder");
  assert.equal((await client.execute("SELECT * FROM project_rfp_revisions")).rows.length,1);
  const completedCalls=calls;response=await generate.POST(request("POST",input),ctx());assert.equal(response.status,200);assert.equal(calls,completedCalls);
  assert.equal((await generate.POST(request("POST",{...input,model:"other-model"}),ctx())).status,409);
  token="reader-token";assert.equal((await status.GET(request("GET"),ctx("project",{requestId:input.requestId}))).status,404);token="owner-token";
  assert.equal((await generate.POST(request("POST",{...await inputFor(),expectedVersion:0}),ctx())).status,400);
  complete=false;response=await generate.POST(request("POST",await inputFor()),ctx());assert.equal(response.status,502);complete=true;assert.equal((await readDocument()).version,1);
  invalid=true;response=await generate.POST(request("POST",await inputFor()),ctx());assert.equal(response.status,400);invalid=false;assert.equal((await readDocument()).version,1);
  input=await inputFor();afterGenerate=async()=>{assert.equal((await detach(s.version)).status,409);assert.equal((await upload("PUT",s.version)).status,409);assert.equal((await generate.POST(request("POST",{...input,requestId:crypto.randomUUID()}),ctx())).status,409);await stop.POST(request("POST"),ctx("project",{requestId:input.requestId}));};
  response=await generate.POST(request("POST",input),ctx());afterGenerate=null;assert.equal((await response.json()).generation.status,"cancelled");assert.equal((await readDocument()).version,1);
  input=await inputFor();afterGenerate=async()=>{const doc=await readDocument();await rfp.PATCH(request("PATCH",{id:doc.id,expectedVersion:doc.version,patch:{title:"Concurrent manual change"}}),ctx());};
  response=await generate.POST(request("POST",input),ctx());afterGenerate=null;assert.equal(response.status,409);assert.equal((await readDocument()).draft.title,"Concurrent manual change");
  input=await inputFor();afterGenerate=async()=>{const key=`changed-${crypto.randomUUID()}`;objects.set(key,Buffer.from("Changed"));await client.execute({sql:"UPDATE project_files SET object_key=?,byte_length=7 WHERE id=?",args:[key,first]});};
  response=await generate.POST(request("POST",input),ctx());afterGenerate=null;assert.equal(response.status,409);assert.equal((await readDocument()).version,2);
  s=await readSource();failStorage=true;assert.equal((await upload("PUT",s.version)).status,500);failStorage=false;assert.equal((await readSource()).file.id,first);
  response=await upload("PUT",s.version,"replacement.md");assert.equal(response.status,200);s=await readSource();assert.notEqual(s.file.id,first);assert.ok((await client.execute({sql:"SELECT id FROM project_files WHERE id=?",args:[first]})).rows.length);
  const before=objects.size;onPut=async()=>{await client.execute("CREATE TRIGGER reject_rfp_source BEFORE UPDATE ON project_rfp_sources BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");};
  assert.equal((await upload("PUT",s.version)).status,500);onPut=null;await client.execute("DROP TRIGGER reject_rfp_source");assert.equal(objects.size,before);assert.equal((await readSource()).file.id,s.file.id);
  response=await upload("PUT",s.version,"blocked.txt","-----BEGIN PRIVATE KEY-----");assert.equal(response.status,200);s=await readSource();const beforeBlocked=calls;
  response=await generate.POST(request("POST",await inputFor()),ctx());assert.equal(response.status,422);assert.equal(calls,beforeBlocked);
  assert.equal((await detach(s.version-1)).status,409);assert.equal((await detach(s.version)).status,200);assert.equal((await readSource()).file,null);
  assert.equal((await remove(s.file.id)).status,200);assert.equal((await readDocument()).version,2);
  response=await upload("POST",s.version+1);assert.equal(response.status,201);s=await readSource();assert.equal(s.version,5);
  input=await inputFor();response=await generate.POST(request("POST",input),ctx());assert.equal(response.status,200,await response.clone().text());assert.equal((await readDocument()).version,3);
  assert.equal((await client.execute("SELECT * FROM project_artifacts")).rows.length,0);
  assert.ok((await client.execute("SELECT * FROM ai_token_usage WHERE purpose='generation'")).rows.length>=5);
  const row=(await client.execute({sql:"SELECT * FROM project_rfp_generation_requests WHERE request_id=?",args:[input.requestId]})).rows[0];assert.ok(row.source_hash);assert.equal(row.document_version,3);
  await assert.rejects(client.execute({sql:"INSERT INTO project_rfp_sources(project_id,workspace_id,file_id,version,created_by,updated_by,created_at,updated_at) VALUES ('second','ws',?,1,'owner','owner','now','now')",args:[s.file.id]}));
  const expired=crypto.randomUUID();
  await client.execute({sql:`INSERT INTO project_rfp_generation_requests(request_id,workspace_id,project_id,user_id,input_json,status,source_file_id,source_version,source_key,source_name,source_size,model,guardrail_version,created_at,lease_until)
    SELECT ?,workspace_id,project_id,user_id,input_json,'running',source_file_id,source_version,source_key,source_name,source_size,model,guardrail_version,created_at,'2000-01-01T00:00:00.000Z' FROM project_rfp_generation_requests WHERE request_id=?`,args:[expired,input.requestId]});
  assert.equal((await(await status.GET(request("GET"),ctx("project",{requestId:expired}))).json()).generation.status,"failed");
  const extract=load(resolve("lib/document-text.ts")).extractDocumentText;
  const {zipSync,strToU8}=require("fflate");
  // A large ignored ZIP entry keeps extracted text small while exercising the real upload boundary.
  await client.executeMultiple("INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('boundary','ws','Boundary','owner','owner'); INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('boundary','ws','owner','admin');");
  const boundaryEntries={"[Content_Types].xml":strToU8('<Types/>'),"word/document.xml":strToU8('<w:document xmlns:w="urn:word"><w:p><w:t>Large source file</w:t></w:p></w:document>'),"padding.bin":new Uint8Array(0)};
  const overhead=zipSync(boundaryEntries,{level:0}).length;
  boundaryEntries["padding.bin"]=new Uint8Array(20*1024*1024-overhead);
  const boundaryDocx=Buffer.from(zipSync(boundaryEntries,{level:0}));assert.equal(boundaryDocx.length,20*1024*1024);
  const boundaryResponse=await upload("POST",0,"boundary.docx",boundaryDocx,"boundary");assert.equal(boundaryResponse.status,201,await boundaryResponse.clone().text());
  const boundarySource=(await boundaryResponse.json()).source;assert.equal(boundarySource.file.size,20*1024*1024);
  const boundaryGenerated=await generate.POST(request("POST",{requestId:crypto.randomUUID(),sourceFileId:boundarySource.file.id,expectedSourceVersion:boundarySource.version,model:"gpt-5.6-sol",documentId:null,expectedVersion:null}),ctx("boundary"));
  assert.equal(boundaryGenerated.status,200,await boundaryGenerated.clone().text());assert.equal((await boundaryGenerated.json()).generation.status,"completed");
  const docx=zipSync({"[Content_Types].xml":strToU8('<Types/>'),"word/document.xml":strToU8('<w:document xmlns:w="urn:word"><w:p><w:t>DOCX source text</w:t></w:p></w:document>'),"word/header1.xml":strToU8('<w:hdr xmlns:w="urn:word"><w:p><w:t>Header source</w:t></w:p></w:hdr>')});
  assert.match(await extract(Buffer.from(docx),"docx",new AbortController().signal),/Header source/);
  const forbidden=zipSync({"[Content_Types].xml":strToU8('<Types/>'),"word/document.xml":strToU8('<!DOCTYPE x [<!ENTITY a "unsafe">]><x/>')});
  await assert.rejects(extract(Buffer.from(forbidden),"docx",new AbortController().signal));
  await assert.rejects(extract(Buffer.from([0xff,0xfe,0x00]),"txt",new AbortController().signal));
  const wrapper=load(resolve("lib/ai/guardrail-files.ts")).extractGuardrailFiles;
  assert.equal((await wrapper([{name:"source.csv",base64:Buffer.from("first,second").toString("base64")}],new AbortController().signal))[0].text,"first,second");
  await assert.rejects(wrapper(Array.from({length:4},()=>({name:"source.txt",base64:"eA=="})),new AbortController().signal));
  response=await upload("PUT",s.version,"source.docx",Buffer.from(docx));assert.equal(response.status,200,await response.clone().text());s=await readSource();
  process.env.ONLYOFFICE_DOCUMENT_SERVER_URL="http://localhost:8080";process.env.ONLYOFFICE_JWT_SECRET="synthetic-onlyoffice-secret";
  const editor=load(resolve("app/api/projects/[projectId]/documents/files/[fileId]/editor/route.ts"));
  token="admin-token";response=await editor.GET(request("GET"),ctx("project",{fileId:s.file.id}));assert.equal((await response.json()).canEdit,false);
  token="owner-token";response=await editor.GET(request("GET"),ctx("project",{fileId:s.file.id}));const config=await response.json();assert.equal(config.canEdit,true);
  await client.execute("UPDATE projects SET owner_id='admin' WHERE id='project'");
  const office=load(resolve("lib/onlyoffice.ts")),callback=load(resolve("app/api/projects/[projectId]/documents/files/[fileId]/editor/callback/route.ts"));
  const payload={key:config.config.document.key,status:6,filetype:"docx",url:"http://localhost:8080/cache/source.docx"};
  const signed=office.signOnlyofficeJwt(payload,process.env.ONLYOFFICE_JWT_SECRET);
  response=await callback.POST(new Request(config.config.editorConfig.callbackUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,token:signed})}),ctx("project",{fileId:s.file.id}));assert.equal(response.status,403);
  await client.execute("UPDATE projects SET owner_id='owner' WHERE id='project'");
  assert.equal((await stop.POST(request("POST"),ctx("project",{requestId:input.requestId}))).status,200);
  console.log("PASS RFP source: single attachment, shared bytes, owner-only writes, file protection, limits, generation, revisions, idempotency, stop, conflicts, rollback cleanup, guardrails and usage.");
  }
}finally{globalThis.fetch=originalFetch;cache.get(resolve("lib/db.ts"))?.exports.db().close();client.close();}

