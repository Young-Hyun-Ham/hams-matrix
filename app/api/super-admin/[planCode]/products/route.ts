import { HttpError, body, checkOrigin, errorResponse } from "@/lib/auth";
import { productPlanCode, requireSuperAdmin } from "@/lib/product-access";
import { listAdminProducts } from "@/lib/super-admin-service";
import { noStore } from "@/lib/admin-query";
import {
  createProduct,
  textInput,
  writeTransaction,
} from "@/lib/plan-products";
type Context = { params: Promise<{ planCode: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    await requireSuperAdmin();
    const { planCode } = await context.params;
    return Response.json(
      await listAdminProducts(productPlanCode(planCode)),
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const user = await requireSuperAdmin();
    checkOrigin(request);
    const { planCode } = await context.params;
    if (productPlanCode(planCode) !== "business")
      throw new HttpError(404, "슈퍼관리자 항목을 찾을 수 없습니다.");
    const input = await body(request);
    const name = textInput(input.name, "상품명");
    return Response.json(
      await writeTransaction((tx) =>
        createProduct(tx, user.id, name, "business"),
      ),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
