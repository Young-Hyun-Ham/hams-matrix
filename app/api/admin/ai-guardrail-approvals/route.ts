import { guardrailConsoleUser } from "@/lib/guardrail-admin-access";
import { errorResponse } from "@/lib/auth";
import { approvalQueue } from "@/lib/ai/guardrail-approvals";
export async function GET(request: Request) {
  try {
    const user = await guardrailConsoleUser(request);
    return Response.json(
      await approvalQueue(user, new URL(request.url).searchParams),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
