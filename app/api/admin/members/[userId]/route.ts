import { errorResponse, requireUser } from "@/lib/auth";
import { productAdminScope } from "@/lib/product-access";
import { getProductMember } from "@/lib/product-admin-service";
import { adminListQuery, noStore } from "@/lib/admin-query";
type Context = { params: Promise<{ userId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const product = await productAdminScope(user);
    const { userId } = await context.params;
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
