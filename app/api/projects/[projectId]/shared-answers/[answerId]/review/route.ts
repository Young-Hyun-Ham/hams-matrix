import {
  body,
  checkOrigin,
  errorResponse,
  rateLimit,
  requireUser,
} from "@/lib/auth";
import { reviewSharedAnswer, getSharedAnswer } from "@/lib/ai/shared-answers";
import { inspectSharedOutput } from "@/lib/ai/shared-answer-output";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; answerId: string }> },
) {
  try {
    checkOrigin(request);
    const { projectId, answerId } = await params,
      user = await requireUser(),
      input = await body(request, 4000);
    await rateLimit(`shared-review:${user.workspaceId}:${user.id}`, 30);
    await inspectSharedOutput(
      user,
      projectId,
      await getSharedAnswer(user, projectId, answerId),
      request.signal,
    );
    return Response.json(
      await reviewSharedAnswer(user, projectId, answerId, input),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
