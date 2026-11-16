import { requireUser, errorResponse } from "@/lib/auth";
import { headerNotificationCount } from "@/lib/header-notifications";
import { noStore } from "@/lib/admin-query";
export async function GET() {
  try {
    const result = await headerNotificationCount(await requireUser());
    return Response.json(result, noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
