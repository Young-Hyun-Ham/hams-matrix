import { body,checkOrigin,requireUser,errorResponse,rateLimit, } from "@/lib/auth";
import { ragAccess } from "@/lib/ai/project-rag-permissions";
import { ragCredential } from "@/lib/ai/project-rag";
import { apiKeyInput } from "@/lib/ai/credentials";
import { embeddingModels } from "@/lib/ai/embeddings";
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}) {
  try {checkOrigin(request);const user=await requireUser(),{projectId}=await params;await ragAccess(user,projectId,true);await rateLimit(`rag-models:${user.workspaceId}:${user.id}`,20);const input=await body(request,2048);const key=input.apiKey?apiKeyInput(input.apiKey):(await ragCredential(user,projectId)).key;return Response.json({models:await embeddingModels(key,request.signal)},{headers:{"Cache-Control":"no-store"}});}catch(error){return errorResponse(error);}
}
