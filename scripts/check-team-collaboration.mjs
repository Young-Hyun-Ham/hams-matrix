import assert from "node:assert/strict";
export async function checkTeamCollaboration({request,client,sessionCookie}) {
  async function signup(email){const response=await request("/api/auth/signup",{method:"POST",data:{email,name:email.split("@")[0],password:"TeamPassword123!",accepted:true}});assert.equal(response.status,201,await response.clone().text());return {cookie:sessionCookie(response),user:(await response.json()).user};}
  const owner=await signup("team-owner@example.test"),member=await signup("team-member@example.test"),outsider=await signup("team-outsider@example.test");
  await client.execute({sql:"UPDATE user_subscriptions SET plan_code='business' WHERE user_id=?",args:[owner.user.id]});
  const created=await request("/api/projects",{method:"POST",cookie:owner.cookie,data:{name:"Collaboration",description:"",memberIds:[]}});assert.equal(created.status,201);const project=(await created.json()).project;
  const add=await request("/api/team/members",{method:"POST",cookie:owner.cookie,data:{projectId:project.id,email:member.user.email}});assert.equal(add.status,201);
  assert.equal((await (await request("/api/me",{cookie:member.cookie})).json()).user.workspaceId,member.user.workspaceId,"invitation does not hijack active sessions");
  assert.equal((await request("/api/me/workspace",{method:"PATCH",cookie:member.cookie,data:{workspaceId:owner.user.workspaceId}})).status,200);
  const write=cookie=>request("/api/team/posts",{method:"POST",cookie,data:{projectId:project.id,title:"Post",body:"Shared content",category:"공유"}});
  assert.equal((await write(owner.cookie)).status,201);assert.equal((await write(member.cookie)).status,403);
  assert.equal((await request(`/api/team/members?projectId=${project.id}`,{cookie:outsider.cookie})).status,404);
  const change=(cookie,data)=>request("/api/team/members",{method:"PATCH",cookie,data:{projectId:project.id,...data}});
  assert.equal((await change(member.cookie,{userId:member.user.id,role:"admin",expectedRole:"viewer"})).status,403);
  assert.equal((await change(owner.cookie,{userId:member.user.id,role:"admin",expectedRole:"viewer"})).status,200);assert.equal((await write(member.cookie)).status,201);
  assert.equal((await change(owner.cookie,{userId:member.user.id,role:"member",expectedRole:"viewer"})).status,409);
  assert.equal((await change(owner.cookie,{userId:member.user.id,role:"owner",expectedOwnerId:owner.user.id,confirmTransfer:false})).status,409);
  const moved=await change(owner.cookie,{userId:member.user.id,role:"owner",expectedOwnerId:owner.user.id,confirmTransfer:true});assert.equal(moved.status,200,await moved.clone().text());
  const scope=(await (await request(`/api/team/members?projectId=${project.id}`,{cookie:member.cookie})).json());assert.equal(scope.ownerId,member.user.id);assert.equal(scope.members.filter(item=>item.role==="owner").length,1);
  assert.equal((await change(owner.cookie,{userId:owner.user.id,role:"admin",expectedRole:"member"})).status,403);
  const me=(await (await request("/api/me",{cookie:member.cookie})).json()).user;assert.equal(me.accountRole,"user");assert.equal(me.plan,"free");
  console.log("PASS: explicit workspace switching, project viewer/admin/owner boundaries, team posting, stale role conflicts and owner transfer without account-role or plan changes.");
}
