import { requireUser, errorResponse } from "@/lib/auth";
import { ragFailures } from "@/lib/ai/intent-classifications";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    return Response.json(
      await ragFailures(
        await requireUser(),
        projectId,
        new URL(request.url).searchParams,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
