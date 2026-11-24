import { body, checkOrigin, errorResponse } from "@/lib/auth";
import { builderUser } from "@/app/(builder)/server/access";
import { deleteScenarios } from "@/app/(builder)/server/repository";
export async function POST(request: Request) {
  try {
    const user = await builderUser();
    checkOrigin(request);
    const input = await body(request, 2200000);
    const result = await deleteScenarios(request, user, input);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
