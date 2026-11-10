import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createDatabaseErdImage,
  databaseErdFor,
  savedDatabaseErdImage,
} from "@/lib/ai/database-erd-images";
export const maxDuration = 300;
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requireUser(),
      { projectId } = await params;
    const tx = await db().transaction("read");
    try {
      const { sourceHash } = await databaseErdFor(tx, user, projectId);
      const image = await savedDatabaseErdImage(tx, user, projectId);
      await tx.commit();
      return Response.json(
        { image, sourceHash },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } finally {
      tx.close();
    }
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId } = await params;
    return Response.json(
      await createDatabaseErdImage(user, projectId, await body(request, 2000)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
