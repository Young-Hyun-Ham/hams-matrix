import { errorResponse } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/product-access";
import {
  getSuperAdminNotificationCount,
  listSuperAdminNotifications,
} from "@/lib/super-admin-service";
import { noStore } from "@/lib/admin-query";

export async function GET() {
  try {
    const user = await requireSuperAdmin();
    const unread = await getSuperAdminNotificationCount(user);
    return Response.json(
      { notifications: await listSuperAdminNotifications(user), unread },
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
