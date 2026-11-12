import { body, checkOrigin, errorResponse } from "@/lib/auth";
import {
  productAdminScope,
  productPlanCode,
  requireProductPlan,
  requireSuperAdmin,
} from "@/lib/product-access";
import { getProductAdminOverview } from "@/lib/product-admin-service";
import { noStore } from "@/lib/admin-query";
import { changeAdminProductStatus } from "@/lib/super-admin-service";
type Context = { params: Promise<{ planCode: string; productId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    const { planCode, productId } = await context.params;
    await requireProductPlan(productId, productPlanCode(planCode));
    const product = await productAdminScope(user, productId, undefined, true);
    return Response.json(await getProductAdminOverview(product), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    checkOrigin(request);
    const { planCode, productId } = await context.params;
    await requireProductPlan(productId, productPlanCode(planCode));
    await changeAdminProductStatus(user, productId, await body(request));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
