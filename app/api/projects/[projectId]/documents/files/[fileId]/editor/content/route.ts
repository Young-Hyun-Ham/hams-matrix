import { errorResponse } from "@/lib/auth";
import { onlyofficeScope, onlyofficeContent, onlyofficeHeaders } from "@/lib/onlyoffice";

export async function GET(request: Request, context: { params: Promise<{ projectId: string; fileId: string }> }) {
  try {
    const { projectId, fileId } = await context.params;
    const bytes = await onlyofficeContent(onlyofficeScope(request, projectId, fileId, "content"));
    return new Response(new Uint8Array(bytes), { headers: {
      ...onlyofficeHeaders, "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error); }
}
