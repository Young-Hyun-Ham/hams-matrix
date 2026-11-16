import { requireUser, errorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { readSourceSnapshot } from "@/lib/source-references";
export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; snapshotId: string }> },
) {
  try {
    const user = await requireUser(),
      { projectId, snapshotId } = await context.params;
    return Response.json({
      snapshot: await readSourceSnapshot(db(), user, projectId, snapshotId),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
