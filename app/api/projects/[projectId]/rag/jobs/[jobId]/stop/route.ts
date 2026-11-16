import { checkOrigin,requireUser,errorResponse } from "@/lib/auth";
import { stopRagJob } from "@/lib/ai/project-rag";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string;jobId:string}>}) {
  try {checkOrigin(request);const {projectId,jobId}=await params;await stopRagJob(await requireUser(),projectId,jobId);return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}
}
