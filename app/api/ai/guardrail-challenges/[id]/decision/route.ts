import { requireUser, checkOrigin, body, errorResponse } from "@/lib/auth";
import {
  userApprovalDecision,
  approvalVersion,
} from "@/lib/ai/guardrail-approvals";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      input = await body(request);
    return Response.json(
      await userApprovalDecision(
        user,
        (await context.params).id,
        String(input.decision),
        approvalVersion(input.expectedVersion),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
