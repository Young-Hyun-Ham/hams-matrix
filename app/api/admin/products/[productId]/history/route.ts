import { HttpError, errorResponse, requireUser } from "@/lib/auth";
import { productAdminScope } from "@/lib/product-access";
import { listProductHistory } from "@/lib/product-admin-service";
import { adminListQuery, noStore } from "@/lib/admin-query";
type Context = { params: Promise<{ productId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const { productId } = await context.params;
    if (productId === "workspace")
      throw new HttpError(404, "관리 항목을 찾을 수 없습니다.");
    const product = await productAdminScope(
      user,
      productId === "me" ? undefined : productId,
    );
    const query = adminListQuery(new URL(request.url));
    return Response.json(await listProductHistory(product, query), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}
