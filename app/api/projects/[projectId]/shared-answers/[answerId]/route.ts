import { errorResponse, requireUser } from "@/lib/auth";
import { getSharedAnswer } from "@/lib/ai/shared-answers";
import { inspectSharedOutput } from "@/lib/ai/shared-answer-output";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; answerId: string }> },
) {
  try {
    const { projectId, answerId } = await params,
      user = await requireUser();
    const answer = await getSharedAnswer(user, projectId, answerId);
    await inspectSharedOutput(user, projectId, answer, request.signal);
    return Response.json(answer, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
