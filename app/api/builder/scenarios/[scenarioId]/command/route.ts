import { body, checkOrigin, errorResponse } from "@/lib/auth";
import { builderUser } from "@/app/(builder)/server/access";
import { setScenarioCommand } from "@/app/(builder)/server/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ scenarioId: string }> },
) {
  try {
    const user = await builderUser();
    checkOrigin(request);
    const { scenarioId } = await context.params;
    const scenario = await setScenarioCommand(request, user, scenarioId, await body(request, 4096));
    return Response.json({ scenario }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
