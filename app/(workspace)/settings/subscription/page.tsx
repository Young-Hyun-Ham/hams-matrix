import { requireUser } from "@/lib/auth";
import { Suspense } from "react";
import { listPlans, memberPlan } from "@/lib/plans";
import { quotaUsage } from "@/lib/quotas";
import { SubscriptionPlans } from "@/components/subscription-plans";
export default function SubscriptionPage() {
  return (
    <Suspense fallback={<p>요금제를 불러오는 중입니다.</p>}>
      <SubscriptionContent />
    </Suspense>
  );
}

async function SubscriptionContent() {
  const user = await requireUser();
  const [current, plans, usage] = await Promise.all([
    memberPlan(user.id),
    listPlans(),
    quotaUsage(user.id),
  ]);
  return (
    <SubscriptionPlans
      plans={plans}
      current={current}
      usage={usage}
      readOnly={user.accountRole === "guest"}
    />
  );
}
