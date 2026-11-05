import assert from "node:assert/strict";
export async function checkRfpGenerationHistory({upload,inputFor,generate,request,ctx,client,setToken}) {
  assert.equal((await upload()).status,201);
  const input=await inputFor();
  assert.equal((await generate.POST(request("POST",{...input,prompt:"Only security"}),ctx())).status,200);
  const get=cursor=>generate.GET(request("GET",undefined,`http://localhost:3000/test${cursor?`?cursor=${encodeURIComponent(cursor)}`:""}`),ctx());
  let response=await get();assert.equal(response.status,200);
  assert.equal(response.headers.get("Cache-Control"),"private, no-store");
  let result=await response.json();assert.equal(result.items.length,1);
  assert.equal(result.items[0].prompt,"Only security");assert.equal(result.items[0].status,"completed");assert.equal(result.items[0].documentVersion,1);
  assert.equal(result.items[0].source_key,undefined);assert.equal(result.items[0].input_json,undefined);
  for(let i=0;i<24;i++) await client.execute({sql:`INSERT INTO project_rfp_generation_requests SELECT ?,workspace_id,project_id,user_id,input_json,'failed',source_file_id,source_version,source_key,source_name,source_size,source_hash,characters,model,guardrail_version,document_id,NULL,502,created_at,finished_at,lease_until FROM project_rfp_generation_requests WHERE request_id=?`,args:[`history-${String(i).padStart(2,"0")}`,input.requestId]});
  result=await(await get()).json();assert.equal(result.items.length,20);assert.ok(result.nextCursor);
  const next=await(await get(result.nextCursor)).json();assert.equal(next.items.length,5);assert.equal(next.nextCursor,null);
  assert.equal(new Set([...result.items,...next.items].map(i=>i.requestId)).size,25);
  assert.equal((await get("malformed")).status,400);
  setToken("reader-token");assert.equal((await(await get()).json()).items.length,0);
  setToken("outsider-token");assert.equal((await get()).status,404);
  setToken("");assert.equal((await get()).status,401);
  setToken("owner-token");
  console.log("PASS RFP history: real routes, saved scope/status/version, private fields, cursor pagination, own-user isolation, project access and authentication.");
}
