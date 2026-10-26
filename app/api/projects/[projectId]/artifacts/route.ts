import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { projectData, mutateArtifact } from "@/lib/artifacts";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { projectId } = await context.params;
    const tx = await db().transaction("read");
    let data;
    try {
      data = await projectData(tx, user, projectId);
      await tx.commit();
    } finally {
      tx.close();
    }
    await audit(request, {
      user,
      action: "READ",
      resource: "project_artifacts",
      resourceId: projectId,
      metadata: { returned: data.artifacts.length },
    });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId } = await context.params;
    return Response.json(
      {
        artifact: await mutateArtifact(
          request,
          user,
          projectId,
          await body(request, 300000),
          "CREATE",
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
