import { body, checkOrigin, errorResponse } from "@/lib/auth";
import {
  productAdminScope,
  productPlanCode,
  requireProductPlan,
  requireSuperAdmin,
} from "@/lib/product-access";
import { listProductMembers } from "@/lib/product-admin-service";
import { adminListQuery, noStore } from "@/lib/admin-query";
import { changeProductMember } from "@/lib/plan-products";
type Context = { params: Promise<{ planCode: string; productId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    const { planCode, productId } = await context.params;
    await requireProductPlan(productId, productPlanCode(planCode));
    const product = await productAdminScope(user, productId, undefined, true);
    const query = adminListQuery(new URL(request.url));
    return Response.json(await listProductMembers(product, query), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    checkOrigin(request);
    const { planCode, productId } = await context.params;
    await requireProductPlan(productId, productPlanCode(planCode));
    const product = await productAdminScope(user, productId, undefined, true);
    await changeProductMember(user, product.id, await body(request), true);
    return Response.json({ ok: true }, noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
