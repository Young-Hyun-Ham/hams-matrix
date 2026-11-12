import { HttpError, errorResponse, requireUser } from "@/lib/auth";
import { productAdminScope } from "@/lib/product-access";
import { getProductHistoryDetail } from "@/lib/product-admin-service";
import { noStore } from "@/lib/admin-query";
type Context = {
  params: Promise<{ productId: string; source: string; id: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const { productId, source, id } = await context.params;
    if (productId === "workspace")
      throw new HttpError(404, "관리 항목을 찾을 수 없습니다.");
    const product = await productAdminScope(
      user,
      productId === "me" ? undefined : productId,
    );
    return Response.json(
      await getProductHistoryDetail(product, source, id),
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
