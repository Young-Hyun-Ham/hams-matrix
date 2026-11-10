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
  const user = await requireUser({ allowPlanMismatch: true });
  const [current, plans, usage] = await Promise.all([
    memberPlan(user.id),
    listPlans(),
    quotaUsage(user.id, user.workspaceId),
  ]);
  return (
    <>
      {(user.plan !== user.workspacePlan || user.productId !== user.workspaceProductId) && (
        <p role="alert">
          현재 계정 요금제는 {current.name}입니다. {user.workspaceName}을
          이용하려면{" "}
          {user.workspaceProductName ?? plans.find((plan) => plan.code === user.workspacePlan)?.name ??
            user.workspacePlan}{" "}
          요금제로 변경해 주세요. 워크스페이스 플랜은 변경되지 않습니다.
        </p>
      )}
      {(await searchParams).reason === "team-sharing" &&
        !current.teamSharingEnabled && (
          <p role="status">현재 요금제에서는 팀공유를 사용할 수 없습니다.</p>
        )}
      <SubscriptionPlans
        user={user}
        plans={plans}
        current={current}
        usage={usage}
        readOnly={user.accountRole === "guest"}
        requiredPlan={
          user.plan !== user.workspacePlan ? user.workspacePlan : undefined
        }
      />
    </>
  );
}
