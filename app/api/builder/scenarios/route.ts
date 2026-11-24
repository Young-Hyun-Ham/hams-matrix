import { body, checkOrigin, errorResponse } from "@/lib/auth";
import { builderUser } from "@/app/(builder)/server/access";
import {
  listScenarios,
  createScenario,
} from "@/app/(builder)/server/repository";
export async function GET(request: Request) {
  try {
    const user = await builderUser();
    const result = await listScenarios(user, new URL(request.url).searchParams);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await builderUser();
    checkOrigin(request);
    const input = await body(request, 2200000);
    const result = await createScenario(request, user, input);
    return Response.json(
      { scenario: result },
      { headers: { "Cache-Control": "no-store" }, status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
