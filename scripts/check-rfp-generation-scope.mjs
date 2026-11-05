import assert from "node:assert/strict";

export async function checkRfpGenerationScope({upload,inputFor,generate,request,ctx,readDocument,client,getAiRequest,getCalls,setToken}) {
  const uploaded=await upload();assert.equal(uploaded.status,201,await uploaded.clone().text());
  const initial=await inputFor(),before=getCalls();
  for(const prompt of [null,42,{},"x".repeat(2001)]){
    const response=await generate.POST(request("POST",{...initial,prompt}),ctx());
    assert.equal(response.status,400,await response.clone().text());
  }
  assert.equal(getCalls(),before,"Invalid scope must not start a paid call");
  setToken("reader-token");
  assert.equal((await generate.POST(request("POST",{...initial,prompt:"Only security requirements"}),ctx())).status,403);
  setToken("owner-token");
  const prompt="Only security requirements; summarize each in one sentence.";
  let response=await generate.POST(request("POST",{...initial,prompt:`  ${prompt}  `}),ctx());
  assert.equal(response.status,200,await response.clone().text());
  assert.equal((await response.json()).generation.status,"completed");
  assert.equal(JSON.parse(getAiRequest().input).requestScope,prompt);
  assert.ok(JSON.parse(getAiRequest().input).untrustedSourceText);
  assert.equal(getAiRequest().tools,undefined);
  const stored=(await client.execute({sql:"SELECT input_json FROM project_rfp_generation_requests WHERE request_id=?",args:[initial.requestId]})).rows[0];
  assert.equal(JSON.parse(stored.input_json).prompt,prompt);
  const calls=getCalls();
  assert.equal((await generate.POST(request("POST",{...initial,prompt}),ctx())).status,200);
  assert.equal(getCalls(),calls,"Same request and scope must reuse the saved result");
  assert.equal((await generate.POST(request("POST",{...initial,prompt:"Another scope"}),ctx())).status,409);
  assert.equal(getCalls(),calls,"Changing scope on an existing request must not regenerate");
  for(const optional of [{prompt:"   "},{}]){
    const input={...await inputFor(),...optional};
    response=await generate.POST(request("POST",input),ctx());assert.equal(response.status,200,await response.clone().text());
    assert.equal(JSON.parse(getAiRequest().input).requestScope,"");
    const row=(await client.execute({sql:"SELECT input_json FROM project_rfp_generation_requests WHERE request_id=?",args:[input.requestId]})).rows[0];
    assert.equal(Object.hasOwn(JSON.parse(row.input_json),"prompt"),false,"Empty scope preserves the legacy request identity");
  }
  const maximum="x".repeat(2000);
  response=await generate.POST(request("POST",{...await inputFor(),prompt:maximum}),ctx());assert.equal(response.status,200,await response.clone().text());
  assert.equal(JSON.parse(getAiRequest().input).requestScope,maximum);
  assert.equal((await readDocument()).version,4);
  console.log("PASS RFP scope: custom/empty/legacy prompts, model forwarding, persisted scope, request identity, length/type validation and permissions.");
}
