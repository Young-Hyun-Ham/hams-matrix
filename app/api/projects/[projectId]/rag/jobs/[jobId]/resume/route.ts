import {
  body,
  checkOrigin,
  requireUser,
  errorResponse,
  rateLimit,
} from "@/lib/auth";
import { resumeRagJob } from "@/lib/ai/rag-resume";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; jobId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId, jobId } = await params;
    await rateLimit(`rag-resume:${user.workspaceId}:${user.id}`, 10);
    return Response.json(
      {
        job: await resumeRagJob(
          user,
          projectId,
          jobId,
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
