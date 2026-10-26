import { ProjectWorkbench } from "@/components/project-workbench";
import { WorkspaceSection } from "@/components/workspace-section";
import type { User } from "@/lib/types";
export const metadata = { title: "화면 구성" };

function ScreensWorkspace({ user }: { user: User }) {
  return <ProjectWorkbench user={user} section="screens" />;
}
export default function Screens() {
  return <WorkspaceSection section="dashboard" page={ScreensWorkspace} />;
}
