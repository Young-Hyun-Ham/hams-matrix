import { guardrailConsoleUser } from "@/lib/guardrail-admin-access";
import { errorResponse } from "@/lib/auth";
import { guardrailOverview } from "@/lib/ai/guardrail-control-tower-overview";
export async function GET(request: Request) {
  try {
    return Response.json(
      await guardrailOverview(await guardrailConsoleUser(request)),
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
