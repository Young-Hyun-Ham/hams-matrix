import { requireUser, checkOrigin, body, errorResponse } from "@/lib/auth";
import { getReview, reviewInfo, decideReview } from "@/lib/ai/change-reviews";
type Context = { params: Promise<{ reviewId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    return Response.json(
      {
        review: reviewInfo(
          await getReview(await requireUser(), (await context.params).reviewId),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    return Response.json(
      {
        review: await decideReview(
          request,
          await requireUser(),
          (await context.params).reviewId,
          await body(request),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
