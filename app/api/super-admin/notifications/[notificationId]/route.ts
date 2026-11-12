import { checkOrigin, errorResponse } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/product-access";
import { markSuperAdminNotificationRead } from "@/lib/super-admin-service";
type Context = { params: Promise<{ notificationId: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    checkOrigin(request);
    const { notificationId } = await context.params;
    await markSuperAdminNotificationRead(user, notificationId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
