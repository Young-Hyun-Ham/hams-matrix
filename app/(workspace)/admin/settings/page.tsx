import "@/styles/admin-settings.css";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { productAdminScope } from "@/lib/product-access";
import { ProductAdmin } from "@/components/admin/product-admin";
import { SettingsTabs } from "@/components/settings-tabs";
import { masterWorkspaceScope } from "@/lib/master-workspace-admin";
const items = [
  ["members", "회원 관리"],
  ["guardrails", "AI 가드레일 관리"],
  ["history", "이력 관리"],
] as const;
export default function Page(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Suspense fallback={<p>관리자설정을 불러오는 중입니다.</p>}>
      <Content {...props} />
    </Suspense>
  );
}
async function Content({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { tab = "members" } = await searchParams;
  if (tab === "plans" && user.accountRole === "master")
    redirect("/super-admin/settings?tab=plans");
  if (!["master", "biz_admin", "team_admin"].includes(user.accountRole))
    redirect("/dashboard");
  if (!items.some(([key]) => key === tab))
    redirect("/admin/settings?tab=members");
  if (user.accountRole === "master") {
    const workspace = await masterWorkspaceScope(user);
    return (
      <section className="admin-settings-page">
        <h1>관리자설정</h1>
        <SettingsTabs
          base="/admin/settings"
          tab={tab}
          items={items}
          variant="admin"
        />
        <div className="admin-settings-content">
          <ProductAdmin
            product={{
              id: String(workspace.id),
              name: String(workspace.name),
              plan_code: String(workspace.plan),
              member_limit: null,
            }}
            base="/api/admin/products/workspace"
            tab={tab}
            workspaceMode
          />
        </div>
      </section>
    );
  }
  let product;
  try {
    product = await productAdminScope(user);
  } catch {
    return (
      <section>
        <h1>관리자설정</h1>
        <p role="alert">
          활성 상품과 관리자 소속을 확인할 수 없습니다. 상품 상태를 확인해
          주세요.
        </p>
      </section>
    );
  }
  return (
    <section className="admin-settings-page">
      <h1>관리자설정</h1>
      <SettingsTabs
        base="/admin/settings"
        tab={tab}
        items={items}
        variant="admin"
      />
      <div className="admin-settings-content">
        <ProductAdmin
          product={product}
          base={`/api/admin/products/${product.id}`}
          tab={tab}
        />
      </div>
    </section>
  );
}
