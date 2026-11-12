import { HttpError, body, checkOrigin, errorResponse } from "@/lib/auth";
import {
  productAdminScope,
  productPlanCode,
  requireProductPlan,
  requireSuperAdmin,
} from "@/lib/product-access";
import { createBusinessAdmin } from "@/lib/plan-products";
type Context = { params: Promise<{ planCode: string; productId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    checkOrigin(request);
    const { planCode, productId } = await context.params;
    const code = productPlanCode(planCode);
    await requireProductPlan(productId, code);
    if (code !== "business") {
      await productAdminScope(user, productId, undefined, true);
      throw new HttpError(405, "지원하지 않는 요청입니다.");
    }
    return Response.json(
      {
        member: await createBusinessAdmin(user, productId, await body(request)),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
