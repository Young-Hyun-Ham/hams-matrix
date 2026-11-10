import "@/styles/admin-settings.css";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listPlans } from "@/lib/plans";
import { PlanAdmin } from "@/components/super-admin/plan-admin";
import { SuperProductConsole } from "@/components/super-admin/product-console";
import { SettingsTabs } from "@/components/settings-tabs";
const items = [
  ["plans", "요금제"],
  ["business", "Business"],
  ["team", "Team"],
] as const;
export default function Page(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Suspense fallback={<p>슈퍼관리자설정을 불러오는 중입니다.</p>}>
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
  if (user.accountRole !== "master") redirect("/dashboard");
  const { tab = "plans" } = await searchParams;
  if (!items.some(([key]) => key === tab))
    redirect("/super-admin/settings?tab=plans");
  return (
    <section className="admin-settings-page">
      <h1>슈퍼관리자설정</h1>
      <SettingsTabs
        base="/super-admin/settings"
        tab={tab}
        items={items}
        variant="admin"
      />
      <div className="admin-settings-content">
        {tab === "plans" ? (
          <PlanAdmin initialPlans={await listPlans()} />
        ) : (
          <SuperProductConsole key={tab} type={tab as "business" | "team"} />
        )}
      </div>
    </section>
  );
}
