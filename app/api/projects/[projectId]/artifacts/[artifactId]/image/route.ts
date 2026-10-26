import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { architectureFor, createArchitectureImage, savedArchitectureImage } from "@/lib/ai/architecture-images";

export const maxDuration = 300;
type Context = { params: Promise<{ projectId: string; artifactId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser(), { projectId, artifactId: id } = await params;
    await architectureFor(db(), user, projectId, id);
    const image = await savedArchitectureImage(db(), user.workspaceId, projectId, id);
    return Response.json({ image }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(), { projectId, artifactId: id } = await params;
    const result = await createArchitectureImage(user, projectId, id, await body(request));
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
