import { errorResponse } from "@/lib/auth";
import { builderUser } from "@/app/(builder)/server/access";
import { version } from "@/app/(builder)/server/repository";
type Context = {
  params: Promise<{ scenarioId: string; versionNumber: string }>;
};
export async function GET(request: Request, context: Context) {
  try {
    const user = await builderUser();
    const { scenarioId, versionNumber } = await context.params;
    const result = await version(user, scenarioId, versionNumber);
    return Response.json(
      { scenario: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
