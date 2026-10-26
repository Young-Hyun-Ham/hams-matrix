import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { mutateArtifact } from "@/lib/artifacts";
type Context = { params: Promise<{ projectId: string; artifactId: string }> };
async function mutate(
  request: Request,
  context: Context,
  action: "UPDATE" | "DELETE",
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId, artifactId } = await context.params;
    return Response.json({
      artifact: await mutateArtifact(
        request,
        user,
        projectId,
        await body(request, 300000),
        action,
        artifactId,
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  return mutate(request, context, "UPDATE");
}
export async function DELETE(request: Request, context: Context) {
  return mutate(request, context, "DELETE");
}
