import "@/styles/settings.css";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AiTokenStatistics } from "@/components/ai/ai-token-statistics";
import { SettingsTabs } from "@/components/settings-tabs";
import {
  AccountSettings,
  InterfaceSettings,
} from "@/components/personal-settings";
const items = [
  ["usage", "토큰 사용량"],
  ["interface", "인터페이스 관리"],
  ["account", "계정 설정"],
] as const;
export default function Page(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <Suspense fallback={<p>설정을 불러오는 중입니다.</p>}>
      <Settings {...props} />
    </Suspense>
  );
}
async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser(),
    { tab = "usage" } = await searchParams;
  if (!items.some(([key]) => key === tab)) redirect("/settings?tab=usage");
  return (
    <section className="settings-page">
      <h1 className="settings-visually-hidden">
        설정 · {items.find(([key]) => key === tab)?.[1]}
      </h1>
      <SettingsTabs base="/settings" tab={tab} items={items} variant="admin" />
      <div className="settings-content">
        {tab === "usage" ? (
          <>
            <p>현재 워크스페이스의 내 사용량</p>
            <AiTokenStatistics key={`${user.id}:${user.workspaceId}`} />
          </>
        ) : tab === "interface" ? (
          <InterfaceSettings userId={user.id} />
        ) : (
          <AccountSettings user={user} />
        )}
      </div>
    </section>
  );
}
