import { requireUser, errorResponse } from "@/lib/auth";
import { intentClassificationReference } from "@/lib/ai/intent-classifications";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      projectId: string;
      eventId: string;
      referenceIndex: string;
    }>;
  },
) {
  try {
    const { projectId, eventId, referenceIndex } = await params;
    return Response.json(
      await intentClassificationReference(
        await requireUser(),
        projectId,
        eventId,
        referenceIndex,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
