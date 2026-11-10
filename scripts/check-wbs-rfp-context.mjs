import assert from "node:assert/strict";
import { resolve } from "node:path";

export async function checkWbsRfpContext({load,client,setToken}) {
  const {readAiPage}=load(resolve("lib/ai/page-data.ts"));
  const {aiPages,pageInstructions,rfpReferenceInstructions}=load(resolve("lib/ai/page-prompts.ts"));
  const {createPageAgent}=load(resolve("lib/ai/page-tools.ts"));
  const {createEmptyRfp}=load(resolve("lib/rfp-template.ts"));
  const user={id:"owner",name:"Owner",workspaceId:"ws",role:"owner",accountRole:"user",onboardingComplete:true};
  const context={projectId:"project",tab:"wbs"};
  const projectPages=Object.values(aiPages).filter(page=>page.source==="artifacts"||page.source==="history");
  for(const page of Object.values(aiPages)) {
    const instructions=pageInstructions({...context,screen:page.key,tab:page.source==="dashboard"||page.source==="team"?null:page.key},page,false);
    assert.equal(instructions.split(rfpReferenceInstructions).length-1,1,`${page.key}: shared RFP instructions exactly once`);
  }
  async function checkProjectTabs(expectedDraft,version) {
    for(const page of projectPages) {
      const tabContext={...context,tab:page.key};
      const initial=await readAiPage(user,tabContext,page);
      const readOnlyAgent=createPageAgent(new Request("http://localhost/test"),user,tabContext,page,false,"제안요청서를 참고해 분석해줘");
      const latest=await readOnlyAgent.execute("read_page",{});
      assert.equal(latest.success,true,`${page.key}: read_page succeeds`);
      assert.equal(readOnlyAgent.tools.some(tool=>tool.name.startsWith("save_")),false,`${page.key}: RFP context does not grant writes`);
      if(page.key==="rfp") {
        assert.deepEqual(initial.document?.draft??null,expectedDraft,`${page.key}: original document contract`);
        assert.deepEqual(latest.data.document,initial.document);
      } else {
        assert.deepEqual(initial.rfp,expectedDraft?{...expectedDraft,id:"rfp-context",version}:null,`${page.key}: full RFP context`);
        assert.equal(initial.rfpAvailable,expectedDraft!==null);
        assert.deepEqual(latest.data.rfp,initial.rfp,`${page.key}: initial and tool context agree`);
      }
    }
  }
  await checkProjectTabs(null);
  for(const key of ["dashboard","team"]) {
    assert.equal(Object.hasOwn(await readAiPage(user,{projectId:"",tab:null},aiPages[key]),"rfp"),false,`${key}: no unrelated project RFP`);
  }
  for(const page of projectPages.filter(page=>page.key!=="rfp")) {
    const noProject=await readAiPage(user,{projectId:"",tab:page.key},page);
    assert.equal(noProject.message,"프로젝트를 먼저 선택해 주세요.");
    assert.equal(Object.hasOwn(noProject,"rfp"),false);
  }
  let result=await readAiPage(user,context,aiPages.wbs);
  assert.equal(result.rfp,null);assert.equal(result.rfpAvailable,false);
  const databaseContext={...context,tab:"database"};
  const missingDatabaseRfp=await readAiPage(user,databaseContext,aiPages.database);
  assert.equal(missingDatabaseRfp.rfp,null);assert.equal(missingDatabaseRfp.rfpAvailable,false);
  const draft=createEmptyRfp("project","RFP schedule source");
  draft.basic.startDate="2026-11-03";draft.basic.endDate="2027-02-03";
  draft.delivery.schedule=[{id:"phase-1",phase:"Analysis",period:"2026-11-03 ~ 2026-12-03",deliverable:"Requirements"}];
  draft.delivery.quality="Review every deliverable";
  draft.scope.included="Manage members and their account profiles";
  draft.delivery.security="Protect personal data";
  draft.appendix.notes="Member identifiers must be unique";
  draft.requirements=[{id:"source-req",number:"SFR-001",category:"SFR",title:"Source requirement",definition:"Definition",details:"Detailed requirement",outputs:"Report",acceptance:"Review report"}];
  await client.execute({sql:"INSERT INTO project_rfp_documents(id,project_id,workspace_id,document_json,created_by,updated_by,created_at,updated_at) VALUES ('rfp-context','project','ws',?,'owner','owner',?,?)",args:[JSON.stringify(draft),new Date().toISOString(),new Date().toISOString()]});
  await checkProjectTabs(draft,1);
  result=await readAiPage(user,context,aiPages.wbs);
  assert.equal(result.total,0);assert.equal(result.rfpAvailable,true);
  assert.deepEqual(result.rfp.delivery,draft.delivery);assert.equal(result.rfp.basic.startDate,"2026-11-03");
  assert.deepEqual(result.rfp.requirements,draft.requirements);
  const agent=createPageAgent(new Request("http://localhost/test"),user,context,aiPages.wbs,false,"Suggest WBS");
  const tool=await agent.execute("read_page",{});
  assert.deepEqual(tool.data.rfp,result.rfp);
  draft.delivery.quality="Updated management plan";
  await client.execute({sql:"UPDATE project_rfp_documents SET document_json=?,version=version+1 WHERE id='rfp-context'",args:[JSON.stringify(draft)]});
  const refreshed=await agent.execute("read_page",{});
  assert.equal(refreshed.data.rfp.delivery.quality,draft.delivery.quality);
  assert.equal(refreshed.data.rfp.version,result.rfp.version+1);
  const requirementContext={...context,tab:"requirement"};
  const requirement=await readAiPage(user,requirementContext,aiPages.requirement);
  assert.equal(requirement.total,0);assert.equal(requirement.rfpAvailable,true);
  assert.deepEqual(requirement.rfp.requirements,draft.requirements);
  assert.deepEqual(requirement.rfp.delivery,draft.delivery);
  const requirementAgent=createPageAgent(new Request("http://localhost/test"),user,requirementContext,aiPages.requirement,false,"Suggest requirements");
  assert.deepEqual((await requirementAgent.execute("read_page",{})).data.rfp,requirement.rfp);
  draft.requirements[0].details="Latest source details";
  await client.execute({sql:"UPDATE project_rfp_documents SET document_json=? WHERE id='rfp-context'",args:[JSON.stringify(draft)]});
  assert.equal((await requirementAgent.execute("read_page",{})).data.rfp.requirements[0].details,"Latest source details");
  const database=await readAiPage(user,databaseContext,aiPages.database);
  assert.equal(database.total,0);assert.equal(database.rfpAvailable,true);
  assert.deepEqual(database.rfp,{...draft,id:"rfp-context",version:refreshed.data.rfp.version});
  const databaseAgent=createPageAgent(new Request("http://localhost/test"),user,databaseContext,aiPages.database,true,"제안요청서에 따라 회원 테이블을 등록해줘");
  assert.deepEqual((await databaseAgent.execute("read_page",{})).data.rfp,database.rfp);
  draft.scope.included="Manage members, profiles and account status";
  await client.execute({sql:"UPDATE project_rfp_documents SET document_json=?,version=version+1 WHERE id='rfp-context'",args:[JSON.stringify(draft)]});
  const databaseLatest=(await databaseAgent.execute("read_page",{})).data;
  assert.equal(databaseLatest.rfp.scope.included,draft.scope.included);
  assert.equal(databaseLatest.rfp.version,database.rfp.version+1);
  await checkProjectTabs(draft,databaseLatest.rfp.version);
  const proposal={action:"CREATE",title:"회원",status:"초안",fields:{definition:databaseLatest.rfp.scope.included,physicalName:"members",logicalName:"회원",notes:`${databaseLatest.rfp.title}: ${databaseLatest.rfp.requirements[0].number}`},structure:{columns:[{id:"temp-member-id",logicalName:"회원_아이디",name:"member_id",dataType:"VARCHAR",length:"36",nullable:false,primaryKey:true,unique:true}]}};
  const staged=await databaseAgent.execute("save_artifact",proposal);
  assert.equal(staged.success,true,JSON.stringify(staged));assert.equal(staged.pending,true);
  assert.equal((await client.execute("SELECT id FROM project_artifacts WHERE kind='database'")).rows.length,0);
  const tx=await client.transaction("write");
  try{const committed=await databaseAgent.commit(tx);assert.equal(committed.length,1);await tx.commit();}catch(error){await tx.rollback();throw error;}finally{tx.close();}
  const saved=(await readAiPage(user,databaseContext,aiPages.database)).artifacts.find(a=>a.kind==="database");
  assert.equal(saved.fields.physicalName,"members");
  assert.equal(saved.fields.definition,draft.scope.included);
  assert.equal(saved.structure.columns[0].name,"member_id");
  const readonlyDatabaseAgent=createPageAgent(new Request("http://localhost/test"),user,databaseContext,aiPages.database,false,"회원 테이블을 등록해줘");
  assert.equal((await readonlyDatabaseAgent.execute("save_artifact",proposal)).status,403);
  assert.deepEqual((await readAiPage(user,{...context,tab:"screen"},aiPages.screen)).rfp,databaseLatest.rfp);
  for(const page of projectPages) {
    const otherProject=await readAiPage(user,{...context,projectId:"second",tab:page.key},page);
    assert.equal(page.key==="rfp"?otherProject.document:otherProject.rfp,null,`${page.key}: other project has no RFP`);
    await assert.rejects(()=>readAiPage({...user,id:"outsider",workspaceId:"other"},{...context,tab:page.key},page));
    await assert.rejects(()=>readAiPage({...user,id:"outsider"},{...context,tab:page.key},page));
  }
  const other=await readAiPage(user,{...context,projectId:"second"},aiPages.wbs);
  assert.equal(other.rfp,null);
  assert.equal((await readAiPage(user,{...requirementContext,projectId:"second"},aiPages.requirement)).rfp,null);
  assert.equal((await readAiPage(user,{...databaseContext,projectId:"second"},aiPages.database)).rfp,null);
  await assert.rejects(()=>readAiPage({...user,workspaceId:"other"},context,aiPages.wbs));
  await assert.rejects(()=>readAiPage({...user,id:"outsider",workspaceId:"other"},context,aiPages.wbs));
  await assert.rejects(()=>readAiPage({...user,id:"outsider",workspaceId:"other"},requirementContext,aiPages.requirement));
  await assert.rejects(()=>readAiPage({...user,workspaceId:"other"},databaseContext,aiPages.database));
  await assert.rejects(()=>readAiPage({...user,id:"outsider",workspaceId:"other"},databaseContext,aiPages.database));
  draft.requirements=[];
  await client.execute({sql:"UPDATE project_rfp_documents SET document_json=? WHERE id='rfp-context'",args:[JSON.stringify(draft)]});
  const emptyRequirements=await readAiPage(user,requirementContext,aiPages.requirement);
  assert.equal(emptyRequirements.rfpAvailable,true);assert.deepEqual(emptyRequirements.rfp.requirements,[]);
  const databaseWithoutRequirements=await readAiPage(user,databaseContext,aiPages.database);
  assert.equal(databaseWithoutRequirements.rfpAvailable,true);
  assert.deepEqual(databaseWithoutRequirements.rfp.requirements,[]);
  assert.equal(databaseWithoutRequirements.rfp.scope.included,draft.scope.included);
  await checkProjectTabs(draft,databaseLatest.rfp.version);
  await client.execute("UPDATE project_rfp_documents SET deleted_at='2026-11-03' WHERE id='rfp-context'");
  await checkProjectTabs(null);
  assert.equal((await readAiPage(user,context,aiPages.wbs)).rfp,null);
  assert.equal((await readAiPage(user,requirementContext,aiPages.requirement)).rfp,null);
  assert.equal((await readAiPage(user,databaseContext,aiPages.database)).rfp,null);
  setToken("owner-token");
  console.log("PASS all project-tab RFP contexts: shared prompt once on every page, full saved document_json and latest read_page for every project tab, original RFP contract, DB staging/commit, read-only tools, empty requirements, missing/deleted documents, project/workspace/member isolation and non-project guidance.");
}
