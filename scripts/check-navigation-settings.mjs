import assert from 'node:assert/strict';
export async function checkNavigationSettings({json,request,db,master,first,second}){
 const patch=(path,cookie,data,status=200)=>json(path,{cookie,method:'PATCH',data},status);
 for(const path of ['/api/me/preferences','/api/admin/members','/api/admin/history','/api/admin/settings/logging'])await json(path,{},401);
 for(const path of ['/api/admin/members','/api/admin/history','/api/admin/settings/logging',`/api/admin/members/${first.data.user.id}`])await json(path,{cookie:first.cookie},403);
 await json('/api/admin/ai-guardrails',{cookie:first.cookie},403);
 let prefs=(await json('/api/me/preferences',{cookie:first.cookie})).data;assert.equal(prefs.version,0);
 assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM user_preferences')).rows[0].n),0);
 await patch('/api/me/preferences',first.cookie,{...prefs,defaultTheme:'dark',toastPosition:'top'});
 await patch('/api/me/preferences',first.cookie,{...prefs,defaultTheme:'light'},409);
 await patch('/api/me/preferences',first.cookie,{version:1,defaultTheme:'system'},400);
 await patch('/api/me/preferences',first.cookie,{version:1,defaultTheme:['dark']},400);
 await patch('/api/me/preferences',first.cookie,{version:1,userId:second.data.user.id},400);
 assert.equal((await json('/api/me/preferences',{cookie:second.cookie})).data.defaultTheme,'light');
 assert.equal((await json('/api/me/preferences',{cookie:first.cookie})).data.defaultTheme,'dark');
 // Counts include every matching member; stable pages must extend beyond the former 200 cap.
 let inserted=0;
 for(const count of [0,1,20,21,100,101,205]){
  const statements=[];while(inserted<count){inserted++;statements.push({sql:'INSERT INTO users(id,name,account_role) VALUES (?,?,?)',args:[`paging-${inserted}`,`Paging Fixture ${inserted}`,'user']});}if(statements.length)await db.batch(statements,'write');
  for(const size of [10,20,50,100]){const data=(await json(`/api/admin/members?q=Paging%20Fixture&pageSize=${size}`,{cookie:master})).data;assert.equal(data.total,count);assert.equal(data.members.length,Math.min(size,count));}
 }
 const end=(await json('/api/admin/members?q=Paging%20Fixture&page=999&pageSize=100',{cookie:master})).data;assert.equal(end.page,3);assert.equal(end.members.length,5);
 assert.equal((await json('/api/admin/members?q=%25',{cookie:master})).data.total,0);
 await json('/api/admin/members?pageSize=200',{cookie:master},400);
 await db.execute("DELETE FROM user_subscriptions WHERE user_id='paging-1'");
 await db.execute("UPDATE users SET name='Missing Subscription' WHERE id='paging-1'");
 assert.equal((await json('/api/admin/members?q=Missing%20Subscription',{cookie:master})).data.members.some(row=>row.id==='paging-1'&&row.plan===null),true);
 const target=second.data.user.id;
 let detail=(await json(`/api/admin/members/${target}`,{cookie:master})).data;assert.equal(detail.canEditRole,true);assert.ok(!JSON.stringify(detail).includes('password_hash'));
 await patch('/api/admin/members',master,{userId:target,version:detail.member.version,plan:'pro'});
 await patch('/api/admin/members',master,{userId:target,version:detail.member.version,plan:'free'},409);
 detail=(await json(`/api/admin/members/${target}`,{cookie:master})).data;
 await patch('/api/admin/members',master,{userId:target,version:detail.member.version,accountRole:'admin'});
 await json('/api/me/preferences',{cookie:second.cookie},401);
 const admin=(await json('/api/auth/login',{method:'POST',data:{email:second.data.user.email,password:'UserPassword123!'}})).cookie;
 const firstDetail=(await json(`/api/admin/members/${first.data.user.id}`,{cookie:admin})).data;assert.equal(firstDetail.canEditRole,false);
 await patch('/api/admin/members',admin,{userId:first.data.user.id,version:firstDetail.member.version,accountRole:'guest'},403);
 const subscriptionBefore=(await db.execute({sql:'SELECT * FROM user_subscriptions WHERE user_id=?',args:[target]})).rows[0];assert.equal(subscriptionBefore.plan_code,'pro');
 const masterRow=(await db.execute("SELECT id,management_version FROM users WHERE account_role='master'")).rows[0];
 await patch('/api/admin/members',master,{userId:masterRow.id,version:masterRow.management_version,accountRole:'user'},403);
 let setting=(await json('/api/admin/settings/logging',{cookie:admin})).data;
 await patch('/api/admin/settings/logging',admin,{value:'false',version:setting.version},400);
 await patch('/api/admin/settings/logging',admin,{value:true,version:setting.version,key:'OTHER'},400);
 await patch('/api/admin/settings/logging',admin,{value:true,version:setting.version});
 await patch('/api/admin/settings/logging',admin,{value:false,version:setting.version},409);
 const before=Number((await db.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n);
 await json('/api/me',{cookie:first.cookie});assert.ok(Number((await db.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n)>before);
 setting=(await json('/api/admin/settings/logging',{cookie:admin})).data;
 await patch('/api/admin/settings/logging',admin,{value:false,version:setting.version});
 const stopped=Number((await db.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n);await json('/api/me',{cookie:first.cookie});assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n),stopped);
 assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM admin_setting_changes')).rows[0].n),2);
 const countBeforeRead=Number((await db.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n);
 for(const source of ['audit','plan','logging']){const data=(await json(`/api/admin/history?source=${source}`,{cookie:admin})).data;assert.ok(data.total>0);assert.ok(data.entries.every(row=>row.source===source));assert.ok(!JSON.stringify(data.entries).includes('beforeJson'));const item=data.entries[0];await json(`/api/admin/history/${source}/${item.id}`,{cookie:admin});}
 assert.equal(Number((await db.execute('SELECT COUNT(*) AS n FROM audit_logs')).rows[0].n),countBeforeRead);
 const historyFixtures=[];
 for(let n=0;n<205;n++)historyFixtures.push({sql:"INSERT INTO audit_logs(id,occurred_at,request_id,workspace_id,actor_id,actor_name,actor_type,action,resource_type,resource_id,outcome,source,http_method,route,before_json) VALUES (?,?,?,?,?,?,'user','READ','boundary-fixture',?,'success','web','GET','/fixture',?)",args:[`boundary-${n}`,n===204?'2026-10-28T15:00:00.000Z':'2026-10-28T14:59:59.999Z',`boundary-request-${n}`,n%2?'other-workspace':null,n%2?'deleted-actor':null,'Preserved actor snapshot',String(n),JSON.stringify({name:'visible',password_hash:'must-not-leak'})]});
 await db.batch(historyFixtures,'write');
 for(const size of [10,20,50,100]){const result=(await json(`/api/admin/history?q=boundary-fixture&pageSize=${size}&from=2026-10-28&to=2026-10-28`,{cookie:admin})).data;assert.equal(result.total,204);assert.equal(result.entries.length,size);}
 const boundary=(await json('/api/admin/history?q=boundary-fixture&from=2026-10-29&to=2026-10-29',{cookie:admin})).data;assert.equal(boundary.total,1);
 const sanitized=(await json('/api/admin/history/audit/boundary-1',{cookie:admin})).data;assert.equal(sanitized.actorName,'Preserved actor snapshot');assert.deepEqual(sanitized.beforeJson,{name:'visible'});
 await json('/api/admin/history?from=2026-02-31',{cookie:admin},400);
 await json('/api/admin/history?from=2026-10-29&to=2026-10-28',{cookie:admin},400);
 await json('/api/admin/history/secrets/anything',{cookie:admin},404);
 await assert.rejects(db.execute('DELETE FROM audit_logs'));await assert.rejects(db.execute("UPDATE admin_setting_changes SET actor_name='changed'"));
 for(const tab of ['usage','interface','account']){const response=await request(`/settings?tab=${tab}`,{cookie:first.cookie});assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('설정'));assert.ok(!html.includes('요금제·회원 관리'));}
 for(const tab of ['plans','members','guardrails','history'])assert.equal((await request(`/admin/settings?tab=${tab}`,{cookie:admin})).status,200);
 for(const section of ['settings','subscription','help'])assert.equal((await request(`/guest/${section}`)).status,200);
 const guestVersion=(await json(`/api/admin/members/${first.data.user.id}`,{cookie:master})).data.member.version;
 await patch('/api/admin/members',master,{userId:first.data.user.id,version:guestVersion,accountRole:'guest'});
 const guest=(await json('/api/auth/login',{method:'POST',data:{email:first.data.user.email,password:'UserPassword123!'}})).cookie;
 await json('/api/me/preferences',{cookie:guest},403);await patch('/api/me/preferences',guest,{version:0,defaultTheme:'dark'},403);
 console.log('PASS: navigation/settings preferences isolation and conflicts; 0/1/20/21/100/101/205 server paging; detail and role protection; logging toggle evidence; global history sources and immutability');
}
