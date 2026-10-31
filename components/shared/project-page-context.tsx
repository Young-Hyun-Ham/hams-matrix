"use client";
import { createContext, useContext } from "react";
import type { Artifact, ArtifactKind, ProjectData } from "@/lib/artifact-types";
import type { User } from "@/lib/types";
import type { ProjectTab } from "@/lib/project-tabs";
import type { PermissionAction } from '@/lib/project-permission-model';
export type ProjectPageContext = {
  user: User;
  data: ProjectData;
  tab: ProjectTab;
  can: (tab: ProjectTab, action: PermissionAction) => boolean;
  verifyPermission: (tab: ProjectTab, action: PermissionAction) => Promise<boolean>;
  artifacts: Artifact[];
  savedArtifact?: Artifact | null;
  updateData?: (data: ProjectData) => void;
  onDirtyChange?: (dirty: boolean) => void;
  selectTab: (tab: ProjectTab) => void;
  openCreate: (kind: ArtifactKind, draft?: Artifact) => void;
  openEdit: (artifact: Artifact) => void;
  openDelete: (artifact: Artifact) => void;
};
export const ProjectPageProvider = createContext<ProjectPageContext | null>(
  null,
);
export function useProjectPage() {
  const context = useContext(ProjectPageProvider);
  if (!context)
    throw new Error(
      "프로젝트 페이지는 ProjectWorkbench 안에서 사용해야 합니다.",
    );
  return context;
}
