import { body, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { saveWbsSchedule } from "@/lib/wbs-schedule-server";
type Context = { params: Promise<{ projectId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(), { projectId } = await context.params;
    return Response.json(await saveWbsSchedule(request, user, projectId, await body(request, 1500000)));
  } catch (error) { return errorResponse(error); }
}
