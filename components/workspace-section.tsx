import { Suspense, type ComponentType } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
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
  await audit(new Request(`http://internal/${section}`), {
    user,
    action: "READ",
    resource: "workspace_page",
    resourceId: user.workspaceId,
    metadata: { section, sample: section === "team" },
  });
  return <Page user={user} />;
}
