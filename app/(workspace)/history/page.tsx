import { ProjectWorkbench } from "@/components/project-workbench";
import { WorkspaceSection } from "@/components/workspace-section";
import type { User } from "@/lib/types";
export const metadata = { title: "변경 이력" };

function HistoryWorkspace({ user }: { user: User }) {
  return <ProjectWorkbench user={user} section="history" />;
}
export default function History() {
  return <WorkspaceSection section="dashboard" page={HistoryWorkspace} />;
}
