import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createWbsImage, savedWbsImage, wbsFor } from "@/lib/ai/wbs-images";

export const maxDuration = 300;
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser(), { projectId } = await params;
    const source = await wbsFor(db(), user, projectId);
    return Response.json({ image: await savedWbsImage(db(), user.workspaceId, projectId), sourceHash: source.sourceHash },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(), { projectId } = await params;
    return Response.json(await createWbsImage(user, projectId, await body(request)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
