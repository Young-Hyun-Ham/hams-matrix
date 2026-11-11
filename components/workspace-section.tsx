import {
  QueryClient,
  dehydrate,
  HydrationBoundary,
} from "@tanstack/react-query";
import { matrixKeys } from "@/lib/query/keys";
import { getWorkspaceSystemSettings } from "@/lib/system-settings/server";
import { createWorkspaceQueryPolicy } from "@/lib/query/policy";
import { serverGetJson } from "@/lib/query/server-fetch";
import { Suspense, type ComponentType } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { workspacePlan } from "@/lib/plans";
import type { MenuKey, User } from "@/lib/types";
import { WorkspaceLoading } from "./workspace-loading";

// Each route owns this boundary so navigation below the shared layout can stream.
type SectionProps = { section: MenuKey; page: ComponentType<{ user: User }> };
export function WorkspaceSection({ section, page }: SectionProps) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <SectionContent section={section} page={page} />
    </Suspense>
  );
}

async function SectionContent({ section, page: Page }: SectionProps) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/onboarding");
  if (user.plan !== user.workspacePlan) return null;
  if (
    section === "team" &&
    !(await workspacePlan(user.id, user.workspaceId)).teamSharingEnabled
  )
    redirect("/settings/subscription?reason=team-sharing");
  await audit(new Request(`http://internal/${section}`), {
    user,
    action: "READ",
    resource: "workspace_page",
    resourceId: user.workspaceId,
    metadata: { section, sample: section === "team" },
  });
  if (section === "dashboard") {
    const settings = await getWorkspaceSystemSettings(user);
    const client = new QueryClient();
    await client
      .query({
        queryKey: matrixKeys.projects({
          userId: user.id,
          workspaceId: user.workspaceId,
        }),
        queryFn: ({ signal }) => serverGetJson("/api/projects", { signal }),
        ...createWorkspaceQueryPolicy(settings),
      })
      .catch(() => undefined);
    return (
      <HydrationBoundary state={dehydrate(client)}>
        <Page user={user} />
      </HydrationBoundary>
    );
  }
  return <Page user={user} />;
}
