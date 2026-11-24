import { requireUser, errorResponse } from "@/lib/auth";
import { intentClassifications } from "@/lib/ai/intent-classifications";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    return Response.json(
      await intentClassifications(
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
