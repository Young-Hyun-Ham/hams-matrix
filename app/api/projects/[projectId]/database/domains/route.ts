import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import {
  mutateDatabaseDomain,
  readDatabaseDomains,
} from "@/lib/database-domains";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { projectId } = await context.params;
    const q = new URL(request.url).searchParams;
    return Response.json(
      await readDatabaseDomains(user, projectId, {
        q: q.get("q") ?? "",
        page: q.get("page") ?? 1,
        pageSize: q.get("pageSize") ?? 20,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
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
      await mutateDatabaseDomain(
        request,
        user,
        projectId,
        await body(request, 10000),
        "CREATE",
      ),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
