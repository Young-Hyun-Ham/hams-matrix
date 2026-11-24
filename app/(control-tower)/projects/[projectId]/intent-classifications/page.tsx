import { requireUser, HttpError } from "@/lib/auth";
import { requireConsoleOwner } from "@/lib/ai-console-access";
import { db } from "@/lib/db";
import { ConsoleAccessBoundary } from "@/components/shared/console-access";
import { IntentClassificationsPage } from "@/components/ai/intent-classifications-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const user = await requireUser();
  try {
    await requireConsoleOwner(user, projectId);
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return (
      <main>
        <h1>의도분류 조회</h1>
        <p role="alert">
          프로젝트 owner 권한과 현재 workspace를 확인해 주세요.
        </p>
      </main>
    );
  }
  const project = (
    await db().execute({
      sql: "SELECT name FROM projects WHERE id=? AND workspace_id=?",
      args: [projectId, user.workspaceId],
    })
  ).rows[0];
  const raw = await searchParams;
  const initial = Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return (
    <ConsoleAccessBoundary
      workspaceId={user.workspaceId}
      projectId={projectId}
      intent
      accessUrl={"/api/projects/" + encodeURIComponent(projectId) + "/access"}
    >
      <IntentClassificationsPage
        projectId={projectId}
        projectName={String(project?.name ?? "")}
        workspaceName={user.workspaceName}
        initial={initial}
      />
    </ConsoleAccessBoundary>
  );
}
