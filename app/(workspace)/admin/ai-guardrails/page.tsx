import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { productAdminScope } from "@/lib/product-access";
import { masterWorkspaceScope } from "@/lib/master-workspace-admin";
export default async function Page() {
  const user = await requireUser({ allowPlanMismatch: true });
  if (user.accountRole === "master") await masterWorkspaceScope(user);
  else await productAdminScope(user);
  redirect("/admin/settings?tab=guardrails");
}
