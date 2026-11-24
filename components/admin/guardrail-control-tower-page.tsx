import {
  guardrailAdminUser,
  guardrailConsoleUser,
} from "@/lib/guardrail-admin-access";
import { HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { GuardrailControlTower } from "./guardrail-control-tower";
import { GuardrailConsoleEntry } from "./guardrail-console-entry";
import { ConsoleAccessBoundary } from "@/components/shared/console-access";

export async function GuardrailControlTowerPage({
  searchParams,
  superMode = false,
}: {
  searchParams: Promise<{
    workspaceId?: string;
    entryProjectId?: string;
    approvalId?: string;
    view?: string;
  }>;
  superMode?: boolean;
}) {
  const params = await searchParams;
  const url = new URL(
    "/api/" + (superMode ? "super-admin" : "admin") + "/ai-guardrail-approvals",
    "http://internal",
  );
  if (params.workspaceId)
    url.searchParams.set("workspaceId", params.workspaceId);
  if (params.entryProjectId)
    url.searchParams.set("entryProjectId", params.entryProjectId);
  let user: Awaited<ReturnType<typeof guardrailAdminUser>>;
  try {
    user = params.entryProjectId
      ? await guardrailConsoleUser(new Request(url))
      : await guardrailAdminUser(new Request(url));
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return (
      <main className="guardrail-control-tower">
        <h1>Guardrail Control Tower</h1>
        <p role="alert">
          기존 관리자 권한과 대상 프로젝트의 owner 권한, 상품 상태를 확인해
          주세요.
        </p>
      </main>
    );
  }
  if (!params.entryProjectId)
    return (
      <main className="guardrail-control-tower">
        <h1>Guardrail Control Tower</h1>
        <GuardrailConsoleEntry
          workspaceId={user.workspaceId}
          superMode={superMode}
          inWindow
          approvalId={params.approvalId}
          view={params.view}
        />
      </main>
    );
  const product = user.managedProductId
    ? (
        await db().execute({
          sql: "SELECT name FROM plan_products WHERE id=?",
          args: [user.managedProductId],
        })
      ).rows[0]
    : null;
  const project = (
    await db().execute({
      sql: "SELECT name FROM projects WHERE id=? AND workspace_id=?",
      args: [params.entryProjectId, user.workspaceId],
    })
  ).rows[0];
  const accessUrl =
    "/api/" +
    (superMode ? "super-admin" : "admin") +
    "/ai-console-access?" +
    new URLSearchParams({
      workspaceId: user.workspaceId,
      entryProjectId: params.entryProjectId,
    });
  return (
    <ConsoleAccessBoundary
      accessUrl={accessUrl}
      workspaceId={user.workspaceId}
      projectId={params.entryProjectId}
    >
      <GuardrailControlTower
        workspaceId={user.workspaceId}
        workspaceName={user.workspaceName}
        productName={String(product?.name ?? "현재 워크스페이스 관리")}
        entryProjectId={params.entryProjectId}
        entryProjectName={String(project?.name ?? "")}
        initialApprovalId={params.approvalId}
        initialView={params.view}
        superMode={superMode}
      />
    </ConsoleAccessBoundary>
  );
}
