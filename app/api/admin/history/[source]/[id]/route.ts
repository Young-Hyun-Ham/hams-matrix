import { errorResponse, requireUser } from "@/lib/auth";
import { productAdminScope } from "@/lib/product-access";
import { getProductHistoryDetail } from "@/lib/product-admin-service";
import { noStore } from "@/lib/admin-query";
type Context = { params: Promise<{ source: string; id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const product = await productAdminScope(user);
    const { source, id } = await context.params;
    return Response.json(
      await getProductHistoryDetail(product, source, id),
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
