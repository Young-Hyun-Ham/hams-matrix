import {
  body,
  checkOrigin,
  errorResponse,
  rateLimit,
  requireUser,
} from "@/lib/auth";
import { reviewSharedAnswer } from "@/lib/ai/shared-answers";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; answerId: string }> },
) {
  try {
    checkOrigin(request);
    const { projectId, answerId } = await params,
      user = await requireUser();
    await rateLimit(`shared-revoke:${user.workspaceId}:${user.id}`, 30);
    return Response.json(
      await reviewSharedAnswer(
        user,
        projectId,
        answerId,
        await body(request, 4000),
        true,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
