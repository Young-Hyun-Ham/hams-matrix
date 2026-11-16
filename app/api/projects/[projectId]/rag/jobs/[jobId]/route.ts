import { requireUser,errorResponse } from "@/lib/auth";
import { readRagJob } from "@/lib/ai/project-rag";
export async function GET(_request:Request,{params}:{params:Promise<{projectId:string;jobId:string}>}) {
  try {const {projectId,jobId}=await params;return Response.json({job:await readRagJob(await requireUser(),projectId,jobId)},{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}
}
