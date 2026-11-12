import { errorResponse } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/product-access";
import { listBusinessRequests } from "@/lib/super-admin-service";

export async function GET() {
  try {
    await requireSuperAdmin();
    return Response.json({ requests: await listBusinessRequests() });
  } catch (error) {
    return errorResponse(error);
  }
}
