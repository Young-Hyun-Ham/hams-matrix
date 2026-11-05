import { requireUser } from "@/lib/auth";
import { Suspense } from "react";
import { listPlans, memberPlan } from "@/lib/plans";
import { quotaUsage } from "@/lib/quotas";
import { SubscriptionPlans } from "@/components/subscription-plans";
export default function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  return (
    <Suspense fallback={<p>요금제를 불러오는 중입니다.</p>}>
      <SubscriptionContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SubscriptionContent({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const user = await requireUser();
  const [current, plans, usage] = await Promise.all([
    memberPlan(user.id),
    listPlans(),
    quotaUsage(user.id),
  ]);
  return (
    <>
      {(await searchParams).reason === "team-sharing" &&
        !current.teamSharingEnabled && (
          <p role="status">현재 요금제에서는 팀공유를 사용할 수 없습니다.</p>
        )}
      <SubscriptionPlans
        plans={plans}
        current={current}
        usage={usage}
        readOnly={user.accountRole === "guest"}
      />
    </>
  );
}
