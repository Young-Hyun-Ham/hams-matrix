import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { OnlyofficeEditor } from "@/components/pages/documents/onlyoffice-editor";

export const metadata = { title: "문서 편집", referrer: "no-referrer" as const };
type Props = { params: Promise<{ projectId: string; fileId: string }> };

async function Content({ params }: Props) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/onboarding");
  const { projectId, fileId } = await params;
  return <OnlyofficeEditor projectId={projectId} fileId={fileId} />;
}

export default function Page(props: Props) {
  return <Suspense fallback={<p role="status">문서 편집기를 불러오는 중입니다.</p>}><Content {...props} /></Suspense>;
}
