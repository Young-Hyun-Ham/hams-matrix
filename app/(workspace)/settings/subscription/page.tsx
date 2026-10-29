import { requireUser } from "@/lib/auth";
import { listPlans, memberPlan } from "@/lib/plans";
import { quotaUsage } from "@/lib/quotas";
import { SubscriptionPlans } from "@/components/subscription-plans";
export default async function SubscriptionPage() {
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
