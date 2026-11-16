import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { projectData } from "@/lib/artifacts";
import { db } from "@/lib/db";
import { requireProjectPermission } from "@/lib/project-permissions";
import { referencesFor } from "@/lib/integration";
import { HttpError } from "@/lib/auth";
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

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { projectId, artifactId } = await context.params;
    const data = await projectData(db(), user, projectId);
    const artifact = data.artifacts.find((a) => a.id === artifactId);
    if (!artifact) throw new HttpError(404, "문서를 찾을 수 없습니다.");
    await requireProjectPermission(
      db(),
      user,
      projectId,
      artifact.kind,
      "READ",
    );
    return Response.json({
      artifact,
      incoming: data.artifacts.filter((a) =>
        referencesFor(a).includes(artifactId),
      ),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
