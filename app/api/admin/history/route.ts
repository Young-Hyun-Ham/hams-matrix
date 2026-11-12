import { errorResponse, requireUser } from "@/lib/auth";
import { productAdminScope } from "@/lib/product-access";
import { listProductHistory } from "@/lib/product-admin-service";
import { adminListQuery, noStore } from "@/lib/admin-query";

export async function GET(request: Request) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const product = await productAdminScope(user);
    const query = adminListQuery(new URL(request.url));
    return Response.json(await listProductHistory(product, query), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
