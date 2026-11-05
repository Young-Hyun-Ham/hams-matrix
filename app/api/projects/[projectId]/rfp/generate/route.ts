import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { generateRfpFromSource } from "@/lib/ai/rfp-generation";
import { readRfpGenerationHistory } from "@/lib/rfp-generation-history";
export const maxDuration = 180;
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser(),
      { projectId } = await context.params;
    return Response.json(
      await readRfpGenerationHistory(
        user,
        projectId,
        new URL(request.url).searchParams.get("cursor"),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId } = await context.params;
    return Response.json(
      await generateRfpFromSource(
        request,
        user,
        projectId,
        await body(request),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
