import { ProjectWorkbench } from "@/components/project-workbench";
import { WorkspaceSection } from "@/components/workspace-section";
import type { User } from "@/lib/types";
export const metadata = { title: "요구사항" };

function RequirementsWorkspace({ user }: { user: User }) {
  return <ProjectWorkbench user={user} section="requirements" />;
}
export default function Requirements() {
  return (
    <WorkspaceSection section="dashboard" page={RequirementsWorkspace} />
  );
}
