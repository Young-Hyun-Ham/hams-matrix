import { guardrailConsoleUser } from "@/lib/guardrail-admin-access";
import { errorResponse } from "@/lib/auth";
import { getApproval } from "@/lib/ai/guardrail-approvals";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await guardrailConsoleUser(request);
    return Response.json(
      await getApproval(user, (await context.params).id, user),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
