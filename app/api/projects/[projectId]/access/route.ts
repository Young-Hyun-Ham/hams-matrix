import { requireUser, errorResponse } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectPermissionAccess } from '@/lib/project-permissions';

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireUser(), { projectId } = await context.params;
    const access = await projectPermissionAccess(db(), user, projectId);
    return Response.json({ ...access, projectId, userId: user.id, workspaceId: user.workspaceId }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) { return errorResponse(error); }
}
