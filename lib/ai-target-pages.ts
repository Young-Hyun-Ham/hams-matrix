import {
  projectSections,
  projectTabLabels,
  type ProjectTab,
} from "./project-tabs";
import type { AiContext } from "./ai-context";

export type AiTargetPage =
  | ProjectTab
  | "dashboard"
  | "team"
  | "project-analysis";
export const aiTargetPages = [
  {
    key: "project-analysis" as const,
    label: "프로젝트 전체 분석",
    project: true,
    supported: true,
  },
  ...Object.entries(projectTabLabels).map(([key, label]) => ({
    key: key as AiTargetPage,
    label,
    project: true,
    supported: key !== "documents",
  })),
  {
    key: "dashboard" as const,
    label: "대시보드",
    project: false,
    supported: true,
  },
  { key: "team" as const, label: "팀 공유", project: false, supported: true },
];
export function isAiTargetPage(value: unknown): value is AiTargetPage {
  return (
    typeof value === "string" &&
    aiTargetPages.some((page) => page.key === value)
  );
}
export function targetFromLocation(
  projectId: string,
  pathname: unknown,
  tab: unknown,
): AiTargetPage | null {
  if (typeof pathname !== "string" || pathname.length > 200) return null;
  if (projectId) {
    const projectRoute = pathname === `/projects/${projectId}`;
    const legacy = Object.hasOwn(projectSections, pathname.slice(1))
      ? projectSections[pathname.slice(1)]
      : undefined;
    if (!projectRoute && !legacy) return null;
    if (typeof tab === "string" && Object.hasOwn(projectTabLabels, tab))
      return tab as ProjectTab;
    if (tab !== undefined && tab !== null) return null;
    return legacy ?? null;
  }
  if (tab !== undefined && tab !== null) return null;
  return pathname === "/dashboard"
    ? "dashboard"
    : pathname === "/team"
      ? "team"
      : null;
}
export function aiTargetContext(
  target: AiTargetPage,
  projectId: string,
  projectName: string,
): AiContext {
  if (target === "project-analysis")
    return {
      pathname: `/projects/${projectId}`,
      screen: "프로젝트 전체 분석",
      tab: null,
      projectId,
      projectName,
    };
  return projectId
    ? {
        pathname: `/projects/${projectId}`,
        screen: "프로젝트 작업 공간",
        tab: target as ProjectTab,
        projectId,
        projectName,
      }
    : {
        pathname: `/${target}`,
        screen: target === "team" ? "팀 공유" : "대시보드",
        tab: null,
        projectId: "",
        projectName: "",
      };
}

// Older metadata responses must not undo a newer target or a temporary room's choice.
export function mergeConversationTarget<
  T extends {
    targetPage?: AiTargetPage | null;
    targetVersion?: number;
    title?: string;
    titleSource?: string;
    titleVersion?: number;
  },
>(current: T, incoming: T): T {
  const merged = { ...incoming };
  if ((current.targetVersion ?? 0) > (incoming.targetVersion ?? 0)) {
    merged.targetPage = current.targetPage;
    merged.targetVersion = current.targetVersion;
  }
  if ((current.titleVersion ?? 0) > (incoming.titleVersion ?? 0)) {
    merged.title = current.title;
    merged.titleVersion = current.titleVersion;
    merged.titleSource = current.titleSource;
  }
  return merged;
}
export function aiSourceTarget(
  projectId: string,
  pathname: unknown,
  tab: unknown,
) {
  return (
    targetFromLocation(projectId, pathname, tab) ??
    targetFromLocation("", pathname, tab)
  );
}
