import { body, checkOrigin, requireUser, errorResponse } from "@/lib/auth";
import {
  startDeliverables,
  latestDeliverable,
} from "@/lib/ai/deliverable-generation";
export const maxDuration = 180;
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId } = await context.params;
    return Response.json(
      await startDeliverables(request, user, projectId, await body(request)),
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser(),
      { projectId } = await context.params;
    const { requireProjectPermission } = await import(
      "@/lib/project-permissions"
    );
    const { activeGuardrailPolicy } = await import("@/lib/ai/guardrail-policy");
    const { db } = await import("@/lib/db");
    const access = await requireProjectPermission(
      db(),
      user,
      projectId,
      "overview",
      "READ",
    );
    const rfpAvailable =
      access.permissionsByTab.rfp.READ &&
      (
        await db().execute({
          sql: "SELECT 1 FROM project_rfp_documents WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL LIMIT 1",
          args: [projectId, user.workspaceId],
        })
      ).rows.length > 0;
    return Response.json({
      rfpAvailable,
      latest: await latestDeliverable(user, projectId),
      maxChanges: (await activeGuardrailPolicy(user.workspaceId)).policy
        .maxChanges,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
