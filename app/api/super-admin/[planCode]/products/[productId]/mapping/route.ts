import { body, checkOrigin, errorResponse } from "@/lib/auth";
import {
  productPlanCode,
  requireProductPlan,
  requireSuperAdmin,
} from "@/lib/product-access";
import { mapProductWorkspace } from "@/lib/super-admin-service";
type Context = { params: Promise<{ planCode: string; productId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    checkOrigin(request);
    const { planCode, productId } = await context.params;
    const code = productPlanCode(planCode);
    await requireProductPlan(productId, code);
    const input = await body(request);
    await mapProductWorkspace(user, productId, String(input.workspaceId ?? ""));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
