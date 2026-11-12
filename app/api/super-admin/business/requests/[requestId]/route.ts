import { body, checkOrigin, errorResponse } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/product-access";
import { updateBusinessRequest } from "@/lib/business-requests";
type Context = { params: Promise<{ requestId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    checkOrigin(request);
    const { requestId } = await context.params;
    await updateBusinessRequest(user, requestId, await body(request));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
