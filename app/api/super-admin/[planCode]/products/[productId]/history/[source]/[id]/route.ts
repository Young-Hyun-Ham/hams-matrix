import { errorResponse } from "@/lib/auth";
import {
  productAdminScope,
  productPlanCode,
  requireProductPlan,
  requireSuperAdmin,
} from "@/lib/product-access";
import { getProductHistoryDetail } from "@/lib/product-admin-service";
import { noStore } from "@/lib/admin-query";
type Context = {
  params: Promise<{
    planCode: string;
    productId: string;
    source: string;
    id: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    const { planCode, productId, source, id } = await context.params;
    await requireProductPlan(productId, productPlanCode(planCode));
    const product = await productAdminScope(user, productId, undefined, true);
    return Response.json(
      await getProductHistoryDetail(product, source, id),
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
