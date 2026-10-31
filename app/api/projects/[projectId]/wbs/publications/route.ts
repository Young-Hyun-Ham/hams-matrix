import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { publishWbsSchedule, readWbsPublication } from "@/lib/wbs-publications";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(), { projectId } = await context.params;
    return Response.json(await readWbsPublication(request, user, projectId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(), { projectId } = await context.params;
    return Response.json(await publishWbsSchedule(request, user, projectId, await body(request, 500000)));
  } catch (error) { return errorResponse(error); }
}
