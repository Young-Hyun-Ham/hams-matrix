"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import { useEffect, useState, type ComponentType } from "react";
import { ConfirmationDialog } from "./shared/confirmation-dialog";
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
import { useProjectAccess } from './shared/use-project-access';
import { ArtifactDialogs } from "./shared/artifact-dialogs";
import { ProjectOverviewPage } from "./pages/project-overview/project-overview-page";
import { RfpPage } from "./pages/rfp/rfp-page";
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
  rfp: RfpPage,
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
  updateData,
  onDirtyChange,
}: {
  user: User;
  data: ProjectData;
  tab: ProjectTab;
  selectTab: (tab: ProjectTab) => void;
  onChanged: (message: string) => void;
  onReload: () => void;
  updateData: (data: ProjectData) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const access = useProjectAccess(user, data.project.id, tab);
  const actions = useArtifactActions(data.project.id, onChanged, access.verifyPermission),
    Page = pages[tab];
  const can = access.can;
  const right = access.access?.permissionsByTab[tab];
  return (
    <ProjectPageProvider.Provider
      value={{
        user,
        data: { ...data, ...access.access, canWrite: !!right && (right.CREATE || right.UPDATE || right.DELETE) },
        tab,
        can,
        verifyPermission: access.verifyPermission,
        artifacts: data.artifacts,
        savedArtifact: actions.savedArtifact,
        updateData,
        onDirtyChange,
        selectTab,
        openCreate: (kind, draft) => { if (can(kind, 'CREATE')) actions.openCreate(kind, draft); },
        openEdit: actions.openEdit,
        openDelete: (artifact) => { if (can(artifact.kind, 'DELETE')) actions.openDelete(artifact); },
      }}
    >
      <div
        className={`matrix-tab-content${tab === "overview" ? "" : " matrix-tab-content-compact"}`}
      >
        <p className="matrix-project-role" role="status">{access.access ? `프로젝트 역할: ${access.access.projectRole}` : access.error ? '프로젝트 권한을 확인할 수 없습니다.' : '프로젝트 권한 확인 중…'}</p>
        {access.error && <p role="alert" className="matrix-error">{access.error}</p>}
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  function navigate(action: () => void) {
    if (hasUnsavedChanges) setPendingNavigation(() => action);
    else action();
  }
  const query = useSearchParams();
  const requestedTab = query.get("tab");
  const tab: ProjectTab =
    requestedTab && Object.hasOwn(projectTabLabels, requestedTab)
      ? (requestedTab as ProjectTab)
      : (projectSections[section ?? ""] ?? "overview");
  function setTab(nextTab: ProjectTab) {
    if (nextTab === tab) return;
    navigate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.pushState(null, "", url);
    });
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
            const projectId = e.target.value;
            navigate(() => { model.setProjectId(projectId); model.setNotice(""); });
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
      {model.data && model.data.project.id === model.projectId && (
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
          updateData={model.updateData}
          onDirtyChange={setHasUnsavedChanges}
        />
      )}
      {pendingNavigation && <ConfirmationDialog title="미저장 변경사항" confirmLabel="변경사항 버리고 이동" onClose={() => setPendingNavigation(null)} onConfirm={() => { pendingNavigation(); setPendingNavigation(null); setHasUnsavedChanges(false); }}><p>편집 중인 내용이 저장되지 않았습니다. 변경사항을 버리고 이동하시겠습니까?</p></ConfirmationDialog>}
    </div>
  );
}
