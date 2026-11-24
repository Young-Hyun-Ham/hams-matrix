import { requireUser, errorResponse, HttpError } from "@/lib/auth";
import { userApprovals } from "@/lib/ai/guardrail-approvals";
import { conversationId } from "@/lib/ai/conversations";
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const convId = conversationId(
      new URL(request.url).searchParams.get("convId"),
    );
    const turnIds = new URL(request.url).searchParams.getAll("turnId");
    if (turnIds.length > 100 || turnIds.some((id) => !id || id.length > 120))
      throw new HttpError(400,"대화 선택을 확인해 주세요.");
    return Response.json(
      { requests: await userApprovals(user, convId, turnIds) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
