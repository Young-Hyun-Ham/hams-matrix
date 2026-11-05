import { errorResponse, requireUser } from "@/lib/auth";
import { rfpGenerationStatus } from "@/lib/ai/rfp-generation";
export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; requestId: string }> },
) {
  try {
    const user = await requireUser(),
      { projectId, requestId } = await context.params;
    return Response.json(
      await rfpGenerationStatus(user, projectId, requestId),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
