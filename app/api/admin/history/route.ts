import {errorResponse,requireUser} from '@/lib/auth';
import {requirePlatformAdmin} from '@/lib/plans';
import {historyList} from '@/lib/admin-history';
import {noStore} from '@/lib/admin-query';
export async function GET(request:Request){try{requirePlatformAdmin(await requireUser());return Response.json(await historyList(new URL(request.url)),noStore);}catch(e){return errorResponse(e);}}
