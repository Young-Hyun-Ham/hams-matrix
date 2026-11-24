import {
  body,
  checkOrigin,
  requireUser,
  errorResponse,
  rateLimit,
} from "@/lib/auth";
import { startRagJob } from "@/lib/ai/project-rag";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId } = await params;
    await rateLimit(`rag-start:${user.workspaceId}:${user.id}`, 10);
    return Response.json(
      {
        job: await startRagJob(
          user,
          projectId,
          await body(request, 4096),
          request.signal,
        ),
      },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
