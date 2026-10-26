"use client";
import { createContext, useContext } from "react";
import type { Artifact, ArtifactKind, ProjectData } from "@/lib/artifact-types";
import type { User } from "@/lib/types";
import type { ProjectTab } from "@/lib/project-tabs";
export type ProjectPageContext = {
  user: User;
  data: ProjectData;
  artifacts: Artifact[];
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
