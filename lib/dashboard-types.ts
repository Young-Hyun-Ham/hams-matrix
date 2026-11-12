import type { ArtifactKind } from "./artifact-types";
import type { Project } from "./project-types";
import type { ProjectTab } from "./project-tabs";

export type DashboardProject = Pick<
  Project,
  "id" | "name" | "description" | "status" | "stats"
> & {
  memberCount: number;
  readableTabs: ProjectTab[];
  completeScope: boolean;
};
export type DashboardArtifact = {
  id: string;
  projectId: string;
  projectName: string;
  kind: ArtifactKind;
  code: string;
  title: string;
  version: number;
  status: string;
  owner: string;
  updatedAt: string;
};
export type DashboardActivity = {
  id: string;
  projectId: string;
  projectName: string;
  kind: ArtifactKind;
  code: string;
  title: string;
  action: string;
  actorName: string;
  occurredAt: string;
};
export type DashboardImpact = {
  state: "none" | "limited" | "candidate";
  limited: boolean;
  candidate?: {
    projectId: string;
    projectName: string;
    source: Pick<DashboardArtifact, "code" | "title" | "version">;
    test: Pick<DashboardArtifact, "code" | "title" | "version">;
    baselineVersion: number;
  };
};
export type DashboardData = {
  selectedProjectId: string | null;
  projectOptions: { id: string; name: string; readableTabs: ProjectTab[] }[];
  projects: DashboardProject[];
  summary: {
    projects: number;
    artifacts: number;
    reviewing: number;
    recentChanges: number | null;
    historyLimited: boolean;
    scopeLimited: boolean;
  };
  recentArtifacts: DashboardArtifact[];
  impactPreview: DashboardImpact;
  recentActivities: DashboardActivity[];
  range: {
    start: string;
    end: string;
    asOf: string;
    startDate: string;
    endDate: string;
  };
};
