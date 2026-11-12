import { HttpError, errorResponse, requireUser } from "@/lib/auth";
import {
  getWorkspaceAdminOverview,
  masterWorkspaceScope,
} from "@/lib/master-workspace-admin";
import { noStore } from "@/lib/admin-query";

export async function GET() {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const workspace = await masterWorkspaceScope(user);
    return Response.json(await getWorkspaceAdminOverview(workspace), noStore);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    await masterWorkspaceScope(user);
    throw new HttpError(
      405,
      "상품 회원 지원은 슈퍼관리자설정에서 진행해 주세요.",
    );
  } catch (error) {
    return errorResponse(error);
  }
}
