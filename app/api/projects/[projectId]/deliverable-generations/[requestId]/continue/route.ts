import { body, checkOrigin, requireUser, errorResponse } from "@/lib/auth";
import { queueDeliverables } from "@/lib/ai/deliverable-generation";
export const maxDuration = 180;
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; requestId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId, requestId } = await context.params;
    return Response.json(
      await queueDeliverables(
        user,
        projectId,
        requestId,
        (await body(request)).resolutions,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
