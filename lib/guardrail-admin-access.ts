import "server-only";
import { db } from "./db";
import { HttpError, requireUser } from "./auth";
import { productAdminScope, productWorkspace } from "./product-access";
import { masterWorkspaceScope } from "./master-workspace-admin";
export async function guardrailAdminUser(request: Request) {
  const user = await requireUser({ allowPlanMismatch: true });
  const url = new URL(request.url),
    superMode = url.pathname.startsWith("/api/super-admin/");
  let workspaceId = url.searchParams.get("workspaceId") ?? user.workspaceId;
  if (!superMode && user.accountRole === "master") {
    const workspace = await masterWorkspaceScope(user, workspaceId);
    return {
      ...user,
      workspaceId,
      workspaceName: String(workspace.name),
      billingWorkspaceId: workspaceId,
      managedProductId: "",
      superMode: false,
      workspaceMode: true,
    };
  }
  if (superMode) {
    if (user.accountRole !== "master")
      throw new HttpError(403, "슈퍼관리자만 사용할 수 있습니다.");
    const row = (
      await db().execute({
        sql: "SELECT product_id FROM workspaces WHERE id=?",
        args: [workspaceId],
      })
    ).rows[0];
    if (!row?.product_id)
      throw new HttpError(404, "상품 워크스페이스를 선택해 주세요.");
    const product = await productAdminScope(
      user,
      String(row.product_id),
      db(),
      true,
    );
    const workspace = await productWorkspace(product.id, workspaceId);
    return {
      ...user,
      workspaceId,
      workspaceName: String(workspace.name),
      workspaceProductId: product.id,
      workspacePlan: product.plan_code,
      billingWorkspaceId: user.workspaceId,
      managedProductId: product.id,
      superMode,
      workspaceMode: false,
    };
  }
  const product = await productAdminScope(user);
  if (!url.searchParams.has("workspaceId"))
    workspaceId = String(
      (
        await db().execute({
          sql: "SELECT id FROM workspaces WHERE product_id=? ORDER BY created_at,id LIMIT 1",
          args: [product.id],
        })
      ).rows[0]?.id ?? "",
    );
  const workspace = await productWorkspace(product.id, workspaceId);
  return {
    ...user,
    workspaceId,
    workspaceName: String(workspace.name),
    workspaceProductId: product.id,
    workspacePlan: product.plan_code,
    billingWorkspaceId: workspaceId,
    managedProductId: product.id,
    superMode,
    workspaceMode: false,
  };
}
