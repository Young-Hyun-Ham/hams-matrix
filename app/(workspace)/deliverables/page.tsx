import { ProjectWorkbench } from "@/components/project-workbench";
import { WorkspaceSection } from "@/components/workspace-section";
import type { User } from "@/lib/types";
export const metadata = { title: "프로젝트 산출물" };

function DeliverablesWorkspace({ user }: { user: User }) {
  return <ProjectWorkbench user={user} section="deliverables" />;
}
export default function Deliverables() {
  return (
    <WorkspaceSection section="dashboard" page={DeliverablesWorkspace} />
  );
}
