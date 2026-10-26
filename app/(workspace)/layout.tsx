import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WorkspaceLoading } from "@/components/workspace-loading";
import "@/styles/workspace.css";
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <AuthenticatedWorkspace>{children}</AuthenticatedWorkspace>
    </Suspense>
  );
}
async function AuthenticatedWorkspace({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/onboarding");
  return <WorkspaceShell user={user}>{children}</WorkspaceShell>;
}
