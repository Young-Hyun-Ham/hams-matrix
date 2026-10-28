import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
export async function bootstrapMaster(db, password) {
  if (typeof password !== "string" || !password) throw new Error("MATRIX_MASTER_PASSWORD is required");
  const tx=await db.transaction("write");
  try {
    const existing=(await tx.execute("SELECT id,name,email,account_role,password_hash FROM users WHERE account_role='master' OR email='master@hamsfam.co.kr'")).rows;
    if(existing.length) {
      if(existing.length!==1 || existing[0].account_role!=="master" || existing[0].email!=="master@hamsfam.co.kr" || existing[0].name!=="master") throw new Error("Master identity conflict");
      const [scheme,salt,key]=String(existing[0].password_hash).split(":");
      const expected=Buffer.from(key??"","hex"), actual=scryptSync(password,salt??"",64);
      if(scheme!=="scrypt" || expected.length!==actual.length || !timingSafeEqual(expected,actual)) throw new Error("Existing master password differs; it was not changed");
      await tx.commit();return {created:false,passwordVerified:true};
    }
    const id=randomUUID(),workspace=randomUUID(),salt=randomBytes(16).toString("hex");
    const hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString("hex")}`;
    await tx.execute({sql:"INSERT INTO users(id,email,name,password_hash,account_role,onboarding_complete) VALUES (?,?,'master',?,'master',1)",args:[id,"master@hamsfam.co.kr",hash]});
    await tx.execute({sql:"INSERT INTO workspaces(id,name,owner_id,subscription_plan) VALUES (?,'master workspace',?,'free')",args:[workspace,id]});
    await tx.execute({sql:"INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,'owner')",args:[workspace,id]});
    await tx.execute({sql:"UPDATE users SET active_workspace_id=? WHERE id=?",args:[workspace,id]});
    await tx.commit();return {created:true,passwordVerified:true};
  }catch(error){await tx.rollback();throw error;}finally{tx.close();}
}
