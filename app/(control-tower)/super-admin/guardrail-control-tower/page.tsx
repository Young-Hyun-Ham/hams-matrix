import { GuardrailControlTowerPage } from "@/components/admin/guardrail-control-tower-page";
export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; approvalId?: string }>;
}) {
  return <GuardrailControlTowerPage searchParams={searchParams} superMode />;
}
