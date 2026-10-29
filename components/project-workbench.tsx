"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import { useEffect, type ComponentType } from "react";
import type { User } from "@/lib/types";
import type { ProjectData } from "@/lib/artifact-types";
import {
  projectSections,
  projectTabLabels,
  type ProjectTab,
} from "@/lib/project-tabs";
import { ProjectPageProvider } from "./shared/project-page-context";
import { useProjectData } from "./shared/use-project-data";
import { useArtifactActions } from "./shared/use-artifact-actions";
import { ArtifactDialogs } from "./shared/artifact-dialogs";
import { ProjectOverviewPage } from "./pages/project-overview/project-overview-page";
import { WbsPage } from "./pages/wbs/wbs-page";
import { ArchitecturePage } from "./pages/architecture/architecture-page";
import { RequirementsPage } from "./pages/requirements/requirements-page";
import { ScreensPage } from "./pages/screens/screens-page";
import { DatabasePage } from "./pages/database/database-page";
import { SpecificationsPage } from "./pages/specifications/specifications-page";
import { VerificationPage } from "./pages/verification/verification-page";
import { TraceabilityPage } from "./pages/traceability/traceability-page";
import { AcceptancePage } from "./pages/acceptance/acceptance-page";
import { HistoryPage } from "./pages/history/history-page";
import { DeliverablesPage } from "./pages/deliverables/deliverables-page";
import { DocumentsPage } from "./pages/documents/documents-page";
import "./project-workbench.css";
const pages: Record<ProjectTab, ComponentType> = {
  overview: ProjectOverviewPage,
  wbs: WbsPage,
  architecture: ArchitecturePage,
  requirement: RequirementsPage,
  screen: ScreensPage,
  database: DatabasePage,
  program: SpecificationsPage,
  test: VerificationPage,
  trace: TraceabilityPage,
  acceptance: AcceptancePage,
  history: HistoryPage,
  export: DeliverablesPage,
  documents: DocumentsPage,
};
function ProjectContent({
  user,
  data,
  tab,
  selectTab,
  onChanged,
  onReload,
}: {
  user: User;
  data: ProjectData;
  tab: ProjectTab;
  selectTab: (tab: ProjectTab) => void;
  onChanged: (message: string) => void;
  onReload: () => void;
}) {
  const actions = useArtifactActions(data.project.id, onChanged),
    Page = pages[tab];
  return (
    <ProjectPageProvider.Provider
      value={{
        user,
        data,
        artifacts: data.artifacts,
        selectTab,
        openCreate: actions.openCreate,
        openEdit: actions.openEdit,
        openDelete: actions.openDelete,
      }}
    >
      <div
        className={`matrix-tab-content${tab === "overview" ? "" : " matrix-tab-content-compact"}`}
      >
        <Page />
        <ArtifactDialogs actions={actions} onReload={onReload} />
      </div>
    </ProjectPageProvider.Provider>
  );
}
export function ProjectWorkbench({
  user,
  initialProjectId,
  section,
}: {
  user: User;
  initialProjectId?: string;
  section?: string;
}) {
  const model = useProjectData(user, initialProjectId);
  const query = useSearchParams();
  const requestedTab = query.get("tab");
  const tab: ProjectTab =
    requestedTab && Object.hasOwn(projectTabLabels, requestedTab)
      ? (requestedTab as ProjectTab)
      : (projectSections[section ?? ""] ?? "overview");
  function setTab(nextTab: ProjectTab) {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.pushState(null, "", url);
  }
  const pathname = usePathname(),
    setAiContext = useWorkspace((s) => s.setAiContext);
  const currentProject =
    model.data?.project.id === model.projectId ? model.data.project : null;
  const aiProjectId = currentProject?.id ?? "",
    aiProjectName = currentProject?.name ?? "";
  useEffect(() => {
    setAiContext({
      pathname,
      screen: "프로젝트 작업 공간",
      tab: aiProjectId ? tab : null,
      projectId: aiProjectId,
      projectName: aiProjectName,
    });
  }, [pathname, tab, aiProjectId, aiProjectName, setAiContext]);
  return (
    <div className="matrix-workbench">
      <label className="matrix-project-picker">
        프로젝트 선택{" "}
        <select
          value={model.projectId}
          onChange={(e) => {
            model.setProjectId(e.target.value);
            model.setNotice("");
          }}
        >
          <option value="">프로젝트 선택</option>
          {model.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <nav className="matrix-tabs" aria-label="프로젝트 메뉴">
        {(Object.keys(projectTabLabels) as ProjectTab[]).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => {
              setTab(t);
              model.setNotice("");
            }}
          >
            {projectTabLabels[t]}
          </button>
        ))}
      </nav>
      {model.notice && (
        <p role="status" className="matrix-notice">
          {model.notice}
        </p>
      )}
      {model.loading && <p role="status">프로젝트를 불러오는 중입니다.</p>}
      {model.error && (
        <div role="alert" className="matrix-error">
          {model.error}{" "}
          <button className="button" onClick={model.reload}>
            다시 불러오기
          </button>
        </div>
      )}
      {!model.loading && !model.projectId && !model.error && (
        <div className="panel matrix-empty">
          대시보드에서 프로젝트를 먼저 생성해 주세요.
        </div>
      )}
      {model.data && !model.loading && (
        <ProjectContent
          key={model.projectId}
          user={user}
          data={model.data}
          tab={tab}
          selectTab={setTab}
          onChanged={(message) => {
            model.setNotice(message);
            model.reload();
          }}
          onReload={model.reload}
        />
      )}
    </div>
  );
}
