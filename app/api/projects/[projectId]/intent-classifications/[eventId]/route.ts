import { requireUser, errorResponse } from "@/lib/auth";
import { intentClassification } from "@/lib/ai/intent-classifications";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; eventId: string }> },
) {
  try {
    const { projectId, eventId } = await params;
    return Response.json(
      await intentClassification(await requireUser(), projectId, eventId),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
