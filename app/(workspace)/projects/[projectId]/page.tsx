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
  return (
    <ProjectWorkbench
      key={projectId}
      user={user}
      initialProjectId={projectId}
    />
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
