import { ProjectWorkbench } from "@/components/project-workbench";
import { WorkspaceSection } from "@/components/workspace-section";
import type { User } from "@/lib/types";
export const metadata = { title: "기능 명세" };

function SpecificationsWorkspace({ user }: { user: User }) {
  return <ProjectWorkbench user={user} section="specifications" />;
}
export default function Specifications() {
  return (
    <WorkspaceSection section="dashboard" page={SpecificationsWorkspace} />
  );
}
