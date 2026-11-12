import { HttpError, errorResponse, requireUser } from "@/lib/auth";
import {
  listWorkspaceMembers,
  masterWorkspaceScope,
} from "@/lib/master-workspace-admin";
import { adminListQuery, noStore } from "@/lib/admin-query";

export async function GET(request: Request) {
  try {
    const user = await requireUser({ allowPlanMismatch: true });
    const workspace = await masterWorkspaceScope(user);
    const query = adminListQuery(new URL(request.url));
    return Response.json(await listWorkspaceMembers(workspace, query), noStore);
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
