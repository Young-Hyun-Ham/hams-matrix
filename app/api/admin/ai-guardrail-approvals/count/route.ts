import { guardrailConsoleUser } from "@/lib/guardrail-admin-access";
import { errorResponse } from "@/lib/auth";
import { approvalCounts } from "@/lib/ai/guardrail-approvals";
export async function GET(request: Request) {
  try {
    return Response.json(
      await approvalCounts(await guardrailConsoleUser(request)),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
