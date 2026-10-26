import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth";
import { WorkspaceLoading } from "@/components/workspace-loading";
export default function Home() {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <HomeRedirect />
    </Suspense>
  );
}
async function HomeRedirect() {
  const user = await currentUser();
  return redirect(
    user ? (user.onboardingComplete ? "/dashboard" : "/onboarding") : "/login",
  );
}
