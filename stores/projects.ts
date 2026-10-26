"use client";
import { create } from "zustand";
import type { Project } from "@/lib/project-types";

export const useProjects = create<{
  scope: string;
  projects: Project[];
  replace: (scope: string, projects: Project[]) => void;
  add: (scope: string, project: Project) => void;
}>((set) => ({
  scope: "",
  projects: [],
  replace: (scope, projects) => set({ scope, projects }),
  add: (scope, project) =>
    set((state) => ({
      scope,
      projects: [
        project,
        ...(state.scope === scope ? state.projects : []).filter(
          (p) => p.id !== project.id,
        ),
      ],
    })),
}));
