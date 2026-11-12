import { errorResponse } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/product-access";
import { getSuperAdminNotificationCount } from "@/lib/super-admin-service";
import { noStore } from "@/lib/admin-query";

export async function GET() {
  try {
    const user = await requireSuperAdmin();
    return Response.json(
      { unread: await getSuperAdminNotificationCount(user) },
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
