import assert from "node:assert/strict";
export async function checkRegistration({request,client,sessionCookie}) {
  const base={name:"Registration Test",email:"new-registration@example.test",password:"NewPassword123!",accepted:true};
  for(const role of ["owner","admin","master","guest"]) assert.equal((await request("/api/auth/signup",{method:"POST",data:{...base,role}})).status,400);
  assert.equal((await request("/api/auth/signup",{method:"POST",data:{...base,plan:"business"}})).status,400);
  const response=await request("/api/auth/signup",{method:"POST",data:base});assert.equal(response.status,201,await response.clone().text());
  const cookie=sessionCookie(response),user=(await response.json()).user;assert.equal(user.accountRole,"user");assert.equal(user.role,"owner");assert.equal(user.plan,"free");assert.equal(user.onboardingComplete,true);
  assert.equal((await request("/api/admin/plans",{cookie})).status,403);
  assert.deepEqual((await (await request("/api/signup/teams?q=test")).json()).teams,[]);
  const signup=await (await request("/signup")).text();assert.ok(!signup.includes("가입 역할"));
  const login=await (await request("/login")).text();assert.ok(login.includes("게스트로 시작하기"));assert.ok(login.includes("회원등록"));
  assert.equal((await client.execute({sql:"SELECT plan_code FROM user_subscriptions WHERE user_id=?",args:[user.id]})).rows[0].plan_code,"free");
  console.log("PASS: registration defaults to user/Free with personal ownership, rejects privilege/paid-plan injection, and exposes guest/signup navigation without a public team directory.");
}
