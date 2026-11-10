import { currentUser, HttpError } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { projectData } from "@/lib/artifacts";
import { requireProjectPermission } from "@/lib/project-permissions";
import { DatabaseToolPage } from "./database-tool-page";
import type { ProjectData } from "@/lib/artifact-types";
export async function DatabaseToolServer({
  params,
  mode,
}: {
  params: Promise<{ projectId: string }>;
  mode: "erd" | "domains";
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.accountRole === "guest") redirect("/guest/dashboard");
  if (!user.onboardingComplete) redirect("/onboarding");
  const { projectId } = await params;
  const tx = await db().transaction("read");
  let data: ProjectData | undefined,
    message = "";
  try {
    await requireProjectPermission(tx, user, projectId, "database", "READ");
    data = await projectData(tx, user, projectId);
    await tx.commit();
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    message = error.message;
  } finally {
    tx.close();
  }
  if (!data)
    return (
      <main className="database-tools">
        <h1>DB설계</h1>
        <p role="alert">{message}</p>
        <a href="/dashboard">대시보드로 이동</a>
      </main>
    );
  return (
    <DatabaseToolPage
      key={projectId}
      user={user}
      initialData={data}
      mode={mode}
      initialLoadedAt={new Date().toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
      })}
    />
  );
}
