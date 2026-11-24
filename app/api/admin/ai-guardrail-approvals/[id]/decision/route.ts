import { guardrailConsoleUser } from "@/lib/guardrail-admin-access";
import { checkOrigin, body, errorResponse } from "@/lib/auth";
import { decideApproval, approvalVersion } from "@/lib/ai/guardrail-approvals";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await guardrailConsoleUser(request),
      input = await body(request);
    return Response.json(
      await decideApproval(
        user,
        (await context.params).id,
        String(input.decision),
        approvalVersion(input.expectedVersion),
        input.comment,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
