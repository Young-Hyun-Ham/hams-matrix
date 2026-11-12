import { HttpError, checkOrigin, errorResponse, requireUser } from "@/lib/auth";
import { productAdminScope } from "@/lib/product-access";
import { listProductMembers } from "@/lib/product-admin-service";
import { adminListQuery, noStore } from "@/lib/admin-query";

export async function GET(request: Request) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const product = await productAdminScope(user);
    const query = adminListQuery(new URL(request.url));
    return Response.json(await listProductMembers(product, query), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    await productAdminScope(user);
    checkOrigin(request);
    throw new HttpError(405, "지원하지 않는 요청입니다.");
  } catch (error) {
    return errorResponse(error);
  }
}
