import { DashboardPage } from "@/components/pages/dashboard/dashboard-page";
import { WorkspaceSection } from "@/components/workspace-section";
export const metadata = { title: "대시보드" };
export default function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[] }>;
}) {
  return (
    <WorkspaceSection
      section="dashboard"
      page={DashboardPage}
      dashboardSearchParams={searchParams}
    />
  );
}
