import { requireUser, errorResponse } from "@/lib/auth";
import { ragSummary } from "@/lib/ai/project-rag";
export async function GET(_request:Request,{params}:{params:Promise<{projectId:string}>}) {
  try { const {projectId}=await params;return Response.json(await ragSummary(await requireUser(),projectId),{headers:{"Cache-Control":"no-store"}}); }catch(error){return errorResponse(error);}
}
