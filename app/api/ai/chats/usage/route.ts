import { requireUser, errorResponse } from "@/lib/auth";
import { generationRequestId } from "@/lib/ai/generation-control";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const requestId = generationRequestId(new URL(request.url).searchParams.get("requestId"));
    const row = (await db().execute({
      sql: "SELECT COALESCE(SUM(input_tokens),0) AS input,COALESCE(SUM(output_tokens),0) AS output,COALESCE(SUM(total_tokens),0) AS total,COUNT(*) AS calls,COALESCE(SUM(CASE WHEN usage_known=0 THEN 1 ELSE 0 END),0) AS unknown,COALESCE(SUM(CASE WHEN usage_final=0 THEN 1 ELSE 0 END),0) AS pending FROM ai_token_usage WHERE request_id=? AND workspace_id=? AND user_id=? AND status<>'duplicate'",
      args: [requestId, user.workspaceId, user.id],
    })).rows[0];
    return Response.json(row, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
