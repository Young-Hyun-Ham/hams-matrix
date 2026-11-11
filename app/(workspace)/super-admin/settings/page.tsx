import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from "@tanstack/react-query";
import { matrixKeys } from "@/lib/query/keys";
import { getWorkspaceSystemSettings } from "@/lib/system-settings/server";
import { createWorkspaceQueryPolicy } from "@/lib/query/policy";
import { serverGetJson } from "@/lib/query/server-fetch";
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
  const client = new QueryClient();
  const scope = { userId: user.id, workspaceId: user.workspaceId };
  const plans = tab === "plans" ? await listPlans() : [];
  if (tab === "plans")
    client.setQueryData([...matrixKeys.scope(scope), "super-admin", "plans"], {
      plans,
    });
  else {
    const settings = await getWorkspaceSystemSettings(user);
    const policy = createWorkspaceQueryPolicy(settings);
    const tasks = [
      client
        .query({
          queryKey: [
            ...matrixKeys.scope(scope),
            "super-admin",
            tab,
            "products",
          ],
          queryFn: ({ signal }) =>
            serverGetJson(`/api/super-admin/${tab}/products`, { signal }),
          ...policy,
        })
        .catch(() => undefined),
    ];
    if (tab === "business")
      tasks.push(
        client
          .query({
            queryKey: [
              ...matrixKeys.scope(scope),
              "super-admin",
              "business",
              "requests",
            ],
            queryFn: ({ signal }) =>
              serverGetJson("/api/super-admin/business/requests", { signal }),
            ...policy,
          })
          .catch(() => undefined),
      );
    await Promise.all(tasks);
  }
  return (
    <HydrationBoundary state={dehydrate(client)}>
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
            <PlanAdmin initialPlans={plans} />
          ) : (
            <SuperProductConsole key={tab} type={tab as "business" | "team"} />
          )}
        </div>
      </section>
    </HydrationBoundary>
  );
}
