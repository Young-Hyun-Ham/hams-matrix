import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { WorkspaceLoading } from "@/components/workspace-loading";
export const metadata = { title: "회원가입" };
export default function Signup() {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <SignupContent />
    </Suspense>
  );
}
async function SignupContent() {
  const user = await currentUser();
  if (user) redirect(user.onboardingComplete ? "/dashboard" : "/onboarding");
  return <AuthForm mode="signup" />;
}
