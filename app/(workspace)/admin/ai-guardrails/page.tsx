import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { isGuardrailAdmin } from "@/lib/ai/guardrail-policy";
import { GuardrailAdmin } from "@/components/admin/guardrail-admin";

export const metadata = { title: "AI 가드레일 관리" };
export default function Page() {
  return <Suspense fallback={<p role="status">관리자 권한을 확인하고 있습니다.</p>}><AuthorizedAdmin /></Suspense>;
}
async function AuthorizedAdmin() {
  const user = await requireUser();
  if (!isGuardrailAdmin(user)) return <section className="page-heading"><h1>접근 권한이 없습니다</h1><p>워크스페이스 관리자만 AI 보안 정책을 관리할 수 있습니다.</p></section>;
  return <GuardrailAdmin workspaceName={user.workspaceName} />;
}
