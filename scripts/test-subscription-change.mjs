// Isolated SQLite tests for subscription mutations; never reads .env.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@libsql/client';
const folder=await mkdtemp(join(tmpdir(),'matrix-subscription-'));
const client=createClient({url:pathToFileURL(join(folder,'test.db')).href});
class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
let user={id:'member',name:'Member',accountRole:'user'};
function load(source,imports){
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(output,{exports,require:name=>{if(!(name in imports))throw new Error(name);return imports[name];},Request,Response,URL,console});return exports;
}
const auth={HttpError,body:request=>request.json(),checkOrigin:request=>{if(request.headers.get('origin')!=='http://test.local')throw new HttpError(403,'origin');},requireUser:async()=>{if(!user)throw new HttpError(401,'login');if(user.accountRole==='guest')throw new HttpError(403,'guest');return user;},errorResponse:error=>Response.json({error:error.message},{status:error.status??500})};
try {
 for(const file of (await readdir('db/migrations')).filter(f=>f.endsWith('.sql')).sort())await client.executeMultiple(await readFile(join('db/migrations',file),'utf8'));
 await client.execute("INSERT INTO users(id,name,account_role) VALUES ('member','Member','user'),('other','Other','user')");
 const plans=load(await readFile('lib/plans.ts','utf8'),{'server-only':{},'./db':{db:()=>client},'./auth':auth,'./plan-types':{isPlatformAdmin:()=>false}});
 const route=load(await readFile('app/api/me/subscription/route.ts','utf8'),{'node:crypto':{randomUUID},'@/lib/auth':auth,'@/lib/db':{db:()=>client},'@/lib/plans':plans,'@/lib/quotas':{quotaPeriod:()=>''}});
 const plus=(await plans.listPlans()).find(p=>p.code==='plus');
 const patch=(data,origin='http://test.local')=>route.PATCH(new Request('http://test.local/api/me/subscription',{method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(data)}));
 const data={plan:'plus',currentPlan:'free',planVersion:plus.version};
 assert.equal((await patch(data,'http://foreign.local')).status,403);
 const member=user;user=null;assert.equal((await patch(data)).status,401);
 user={...member,accountRole:'guest'};assert.equal((await patch(data)).status,403);user=member;
 assert.equal((await patch({...data,userId:'other'})).status,400);
 assert.equal((await patch({...data,plan:'invalid'})).status,400);
 assert.equal((await patch({...data,planVersion:plus.version+1})).status,409);
 assert.equal((await patch(data)).status,200);
 assert.equal((await plans.memberPlan('member')).code,'plus');assert.equal((await plans.memberPlan('other')).code,'free');
 assert.equal((await client.execute("SELECT management_version FROM users WHERE id='member'")).rows[0].management_version,2);
 assert.equal((await patch(data)).status,409);
 assert.equal((await patch({...data,currentPlan:'plus'})).status,200);
 assert.equal((await client.execute('SELECT COUNT(*) AS n FROM plan_change_logs')).rows[0].n,1);
 const free=(await plans.listPlans()).find(p=>p.code==='free');
 assert.equal((await patch({plan:'free',currentPlan:'plus',planVersion:free.version})).status,200);
 assert.equal((await plans.memberPlan('member')).code,'free');
 assert.equal((await client.execute('PRAGMA foreign_key_check')).rows.length,0);
 console.log('PASS: authentication, guest denial, origin, validation, stale catalog/subscription, upgrade/downgrade, own-account scope, duplicate audit prevention, management version, foreign keys');
} finally {client.close();}
