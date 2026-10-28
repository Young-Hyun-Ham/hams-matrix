import {errorResponse,HttpError,requireUser} from '@/lib/auth';
import {requirePlatformAdmin} from '@/lib/plans';
import {db} from '@/lib/db';
import {noStore} from '@/lib/admin-query';
export async function GET(_request:Request,{params}:{params:Promise<{userId:string}>}){try{const user=await requireUser();requirePlatformAdmin(user);const {userId}=await params;
const member=(await db().execute({sql:'SELECT u.id,u.name,u.email,u.job_title AS jobTitle,u.account_role AS accountRole,u.created_at AS createdAt,u.updated_at AS updatedAt,u.management_version AS version,s.plan_code AS plan FROM users u LEFT JOIN user_subscriptions s ON s.user_id=u.id WHERE u.id=?',args:[userId]})).rows[0];
if(!member)throw new HttpError(404,'회원을 찾을 수 없습니다.');return Response.json({member,canEditRole:user.accountRole==='master'&&member.accountRole!=='master'},noStore);}catch(e){return errorResponse(e);}}
