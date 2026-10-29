import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { WorkspaceLoading } from "@/components/workspace-loading";
export const metadata = { title: "가입 유형 선택" };
export default function Onboarding() {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <Content />
    </Suspense>
  );
}
async function Content() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.onboardingComplete) redirect("/dashboard");
  await db().execute({
    sql: "UPDATE users SET onboarding_complete=1 WHERE id=?",
    args: [user.id],
  });
  return redirect("/dashboard");
}
