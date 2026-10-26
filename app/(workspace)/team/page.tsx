import { TeamPage } from "@/components/pages/team/team-page";
import { WorkspaceSection } from "@/components/workspace-section";
export const metadata = { title: "팀 공유" };
export default function Team() {
  return <WorkspaceSection section="team" page={TeamPage} />;
}
