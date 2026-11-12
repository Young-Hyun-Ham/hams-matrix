import { errorResponse } from "@/lib/auth";
import {
  productAdminScope,
  productPlanCode,
  requireProductPlan,
  requireSuperAdmin,
} from "@/lib/product-access";
import { findProductMemberCandidates } from "@/lib/product-admin-service";
import { noStore } from "@/lib/admin-query";
type Context = { params: Promise<{ planCode: string; productId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    const { planCode, productId } = await context.params;
    await requireProductPlan(productId, productPlanCode(planCode));
    await productAdminScope(user, productId, undefined, true);
    const email =
      new URL(request.url).searchParams.get("email")?.trim().toLowerCase() ??
      "";
    return Response.json(
      { members: await findProductMemberCandidates(user, email) },
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
