import { requireUser, errorResponse } from "@/lib/auth";
import { deliverableStatus } from "@/lib/ai/deliverable-generation";
export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; requestId: string }> },
) {
  try {
    const user = await requireUser(),
      { projectId, requestId } = await context.params;
    return Response.json(await deliverableStatus(user, projectId, requestId));
  } catch (e) {
    return errorResponse(e);
  }
}
