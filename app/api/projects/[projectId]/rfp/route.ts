import { requireUser,checkOrigin,body,errorResponse } from '@/lib/auth';
import { db } from '@/lib/db';
import { readRfp,mutateRfp } from '@/lib/rfp-server';
type Context={params:Promise<{projectId:string}>};
const headers={'Cache-Control':'private, no-store'};
export async function GET(_request:Request,context:Context){try{const user=await requireUser(),{projectId}=await context.params;return Response.json(await readRfp(db(),user,projectId),{headers});}catch(e){return errorResponse(e);}}
async function change(request:Request,context:Context,action:'CREATE'|'UPDATE'|'DELETE'){try{checkOrigin(request);const user=await requireUser(),{projectId}=await context.params,input=await body(request,400000);return Response.json({document:await mutateRfp(request,user,projectId,input,action)},{status:action==='CREATE'?201:200,headers});}catch(e){return errorResponse(e);}}
export const POST=(request:Request,context:Context)=>change(request,context,'CREATE');
export const PATCH=(request:Request,context:Context)=>change(request,context,'UPDATE');
export const DELETE=(request:Request,context:Context)=>change(request,context,'DELETE');
