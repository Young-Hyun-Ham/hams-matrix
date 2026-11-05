import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkGuardrailChangeLimit({load}) {
  const {validateGuardrailPolicy}=load(resolve("lib/ai/guardrail-policy.ts"));
  const {defaultGuardrailPolicy}=load(resolve("lib/ai/guardrail-types.ts"));
  const {createPageAgent}=load(resolve("lib/ai/page-tools.ts"));
  const {aiPages}=load(resolve("lib/ai/page-prompts.ts"));
  for(const maxChanges of [0,3,4,99,100]) assert.equal(validateGuardrailPolicy({...defaultGuardrailPolicy,maxChanges}).maxChanges,maxChanges);
  for(const maxChanges of [-1,101,1.5,"100",null]) assert.throws(()=>validateGuardrailPolicy({...defaultGuardrailPolicy,maxChanges}),/0~100/);
  assert.equal(defaultGuardrailPolicy.maxChanges,3);
  const user={id:"owner",name:"Synthetic owner",workspaceId:"ws",role:"owner",accountRole:"user",onboardingComplete:true};
  const makeAgent=maxChanges=>createPageAgent(new Request("http://localhost/test"),user,{projectId:"project",tab:"wbs"},aiPages.wbs,true,"Register WBS create",undefined,{policy:{...defaultGuardrailPolicy,maxChanges},inspect:async()=>{}});
  const fields={phase:"분석",taskType:"요약",startDate:"2026-11-03",endDate:"2026-11-04",plannedEffort:"0",actualEffort:"0",progress:"0",definition:"Scope"};
  const agent=makeAgent(100);
  for(let index=0;index<100;index++){
    const result=await agent.execute("save_artifact",{action:"CREATE",title:`Task ${index}`,fields});
    assert.equal(result.success,true,JSON.stringify(result));
  }
  assert.equal(agent.pendingCount(),100);
  const overflow=await agent.execute("save_artifact",{action:"CREATE",title:"Overflow",fields});
  assert.equal(overflow.success,false);assert.equal(overflow.status,400);assert.match(overflow.error,/100/);
  const {db}=load(resolve("lib/db.ts"));
  const tx=await db().transaction("write");
  try {
    assert.equal((await agent.commit(tx)).length,100);
    assert.equal(Number((await tx.execute("SELECT COUNT(*) AS count FROM project_artifacts WHERE kind='wbs'")).rows[0].count),100);
  } finally {await tx.rollback();tx.close();}
  const zero=await makeAgent(0).execute("save_artifact",{action:"CREATE",title:"Blocked",fields});
  assert.equal(zero.success,false);assert.match(zero.error,/0/);
  const {generateAi}=load(resolve("lib/ai-server.ts"));
  const originalFetch=globalThis.fetch;
  let calls=0,executed=0;
  globalThis.fetch=async()=>Response.json({status:"completed",output:++calls===1
    ? Array.from({length:101},(_,index)=>({type:"function_call",call_id:`call-${index}`,name:index?"save_artifact":"read_page",arguments:"{}"}))
    : [{type:"message",content:[{type:"output_text",text:"Done"}]}]});
  try {
    assert.equal(await generateAi("gpt-5.6-sol","Test","Test",{tools:[],execute:async()=>{executed++;return {success:true};}}),"Done");
    assert.equal(executed,101);
    globalThis.fetch=async()=>Response.json({status:"completed",output:Array.from({length:102},(_,index)=>({type:"function_call",call_id:`overflow-${index}`,name:"read_page",arguments:"{}"}))});
    await assert.rejects(()=>generateAi("gpt-5.6-sol","Test","Test",{tools:[],execute:async()=>({})}),/도구 호출/);
  } finally {globalThis.fetch=originalFetch;}
  console.log("PASS guardrail change limit: 0..100 integer validation, invalid boundary rejection, default retained, 100 real WBS mutation previews and transactional saves, 101st blocked, zero policy enforced.");
}
