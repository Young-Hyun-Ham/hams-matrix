import { body, checkOrigin, errorResponse } from "@/lib/auth";
import { builderUser } from "@/app/(builder)/server/access";
import { versions, publish } from "@/app/(builder)/server/repository";
type Context = { params: Promise<{ scenarioId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await builderUser();
    const { scenarioId } = await context.params;
    const result = await versions(user, scenarioId);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const user = await builderUser();
    checkOrigin(request);
    const { scenarioId } = await context.params;
    const input = await body(request, 2200000);
    const result = await publish(request, user, scenarioId, input);
    return Response.json(
      { scenario: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
