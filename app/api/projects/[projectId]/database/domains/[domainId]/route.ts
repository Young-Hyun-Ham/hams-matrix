import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import {
  mutateDatabaseDomain,
  readDatabaseDomains,
} from "@/lib/database-domains";
type Context = { params: Promise<{ projectId: string; domainId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { projectId, domainId } = await context.params;
    return Response.json(
      await readDatabaseDomains(user, projectId, {}, domainId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
async function mutate(
  request: Request,
  context: Context,
  action: "UPDATE" | "DELETE",
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { projectId, domainId } = await context.params;
    return Response.json(
      await mutateDatabaseDomain(
        request,
        user,
        projectId,
        await body(request, 10000),
        action,
        domainId,
      ),
    );
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
