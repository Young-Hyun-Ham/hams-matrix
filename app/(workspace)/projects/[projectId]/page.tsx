import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from "@tanstack/react-query";
import { matrixKeys } from "@/lib/query/keys";
import { getWorkspaceSystemSettings } from "@/lib/system-settings/server";
import { createWorkspaceQueryPolicy } from "@/lib/query/policy";
import { serverGetJson } from "@/lib/query/server-fetch";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ProjectWorkbench } from "@/components/project-workbench";
export const metadata = { title: "프로젝트 작업 공간" };
async function Content({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/onboarding");
  const { projectId } = await params;
  const scope = { userId: user.id, workspaceId: user.workspaceId };
  const settings = await getWorkspaceSystemSettings(user);
  const client = new QueryClient();
  await client
    .query({
      queryKey: matrixKeys.artifacts(scope, projectId),
      queryFn: ({ signal }) =>
        serverGetJson(
          `/api/projects/${encodeURIComponent(projectId)}/artifacts`,
          { signal },
        ),
      ...createWorkspaceQueryPolicy(settings),
    })
    .catch(() => undefined);
  return (
    <HydrationBoundary state={dehydrate(client)}>
      <ProjectWorkbench
        key={projectId}
        user={user}
        initialProjectId={projectId}
      />
    </HydrationBoundary>
  );
}
export default function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<p>프로젝트를 불러오는 중입니다.</p>}>
      <Content params={params} />
    </Suspense>
  );
}
