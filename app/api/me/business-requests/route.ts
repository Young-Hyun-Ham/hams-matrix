import {
  body,
  checkOrigin,
  errorResponse,
  requireUser,
  rateLimit,
  HttpError,
} from "@/lib/auth";
import {
  submitBusinessRequest,
  ownBusinessRequests,
} from "@/lib/business-requests";
import { db } from "@/lib/db";
export async function GET() {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    return Response.json(
      { requests: await ownBusinessRequests(user.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser({ allowPlanMismatch: true });
    await rateLimit(`business-request:${user.id}`, 10);
    return Response.json(
      { request: await submitBusinessRequest(user, await body(request)) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser({ allowPlanMismatch: true });
    const input = await body(request);
    const result = await db().execute({
      sql: "UPDATE business_requests SET status='withdrawn',version=version+1 WHERE id=? AND user_id=? AND version=? AND status IN ('submitted','reviewing','contracting')",
      args: [String(input.id ?? ""), user.id, Number(input.version ?? 0)],
    });
    if (!result.rowsAffected)
      throw new HttpError(409, "철회 가능한 신청을 다시 확인해 주세요.");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
