import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";
import { WorkspaceLoading } from "@/components/workspace-loading";
export const metadata = { title: "로그인" };
export default function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect(user.onboardingComplete ? "/dashboard" : "/onboarding");
  return <AuthForm mode="login" errorCode={(await searchParams).error} />;
}
