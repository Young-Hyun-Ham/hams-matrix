import { HttpError, errorResponse, requireUser } from "@/lib/auth";
import {
  getWorkspaceHistoryDetail,
  masterWorkspaceScope,
} from "@/lib/master-workspace-admin";
import { noStore, paging } from "@/lib/admin-query";
type Context = { params: Promise<{ source: string; id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const workspace = await masterWorkspaceScope(user);
    const { source, id } = await context.params;
    paging(new URL(request.url));
    return Response.json(
      await getWorkspaceHistoryDetail(workspace, source, id),
      noStore,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: Request, context: Context) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    await masterWorkspaceScope(user);
    await context.params;
    throw new HttpError(
      405,
      "상품 회원 지원은 슈퍼관리자설정에서 진행해 주세요.",
    );
  } catch (error) {
    return errorResponse(error);
  }
}
