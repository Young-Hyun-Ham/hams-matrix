import {errorResponse,requireUser} from '@/lib/auth';
import {requirePlatformAdmin} from '@/lib/plans';
import {historyDetail} from '@/lib/admin-history';
import {noStore} from '@/lib/admin-query';
export async function GET(_request:Request,{params}:{params:Promise<{source:string,id:string}>}){try{requirePlatformAdmin(await requireUser());const {source,id}=await params;return Response.json(await historyDetail(source,id),noStore);}catch(e){return errorResponse(e);}}
