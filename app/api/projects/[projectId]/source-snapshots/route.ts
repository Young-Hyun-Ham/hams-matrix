import { body, checkOrigin, requireUser, errorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  captureSource,
  persistCapturedSource,
  verifyCapturedSources,
} from "@/lib/source-capture";
import { requireProjectPermission } from "@/lib/project-permissions";
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId } = await context.params,
      input = await body(request);
    await requireProjectPermission(db(), user, projectId, "overview", "READ");
    const s = await captureSource(
      user,
      projectId,
      {
        type: String(input.type),
        id: typeof input.id === "string" ? input.id : undefined,
      },
      request.signal,
    );
    const tx = await db().transaction("write");
    try {
      await verifyCapturedSources(tx, user, projectId, [s]);
      await persistCapturedSource(tx, user, projectId, s);
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    } finally {
      tx.close();
    }
    return Response.json({ snapshot: { id: s.id, name: s.name } });
  } catch (e) {
    return errorResponse(e);
  }
}
