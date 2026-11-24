import { errorResponse } from "@/lib/auth";
import { guardrailAdminUser } from "@/lib/guardrail-admin-access";
import {
  consoleOwnedProjects,
  requireConsoleOwner,
} from "@/lib/ai-console-access";
export async function GET(request: Request) {
  try {
    const user = await guardrailAdminUser(request);
    const projectId =
      new URL(request.url).searchParams.get("entryProjectId") ?? "";
    if (projectId) await requireConsoleOwner(user, projectId);
    return Response.json(
      {
        userId: user.id,
        workspaceId: user.workspaceId,
        projectId,
        canOpen: !!projectId,
        projects: await consoleOwnedProjects(user),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
