import { requireUser, errorResponse } from "@/lib/auth";
import { getApproval } from "@/lib/ai/guardrail-approvals";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    return Response.json(await getApproval(user, (await context.params).id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
