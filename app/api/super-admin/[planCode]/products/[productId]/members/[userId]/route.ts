import { errorResponse } from "@/lib/auth";
import {
  productAdminScope,
  productPlanCode,
  requireProductPlan,
  requireSuperAdmin,
} from "@/lib/product-access";
import { getProductMember } from "@/lib/product-admin-service";
import { adminListQuery, noStore } from "@/lib/admin-query";
type Context = {
  params: Promise<{ planCode: string; productId: string; userId: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    const { planCode, productId, userId } = await context.params;
    await requireProductPlan(productId, productPlanCode(planCode));
    const product = await productAdminScope(user, productId, undefined, true);
    const query = adminListQuery(new URL(request.url));
    return Response.json(
      {
        member: await getProductMember(product, userId, query),
        canEditRole: false,
      },
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
