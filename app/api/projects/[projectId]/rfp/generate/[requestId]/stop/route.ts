import { checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { rfpGenerationStatus } from "@/lib/ai/rfp-generation";
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; requestId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId, requestId } = await context.params;
    return Response.json(
      await rfpGenerationStatus(user, projectId, requestId, true),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
