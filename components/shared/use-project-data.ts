"use client";
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import type { Project } from "@/lib/project-types";
import type { ProjectData } from "@/lib/artifact-types";
import { useWorkspace } from "@/stores/workspace";
import { jsonRequest } from "@/lib/client-request";
export function useProjectData(user: User, initialProjectId?: string) {
  const aiDataVersion = useWorkspace((s) => s.aiDataVersion);
  const [projects, setProjects] = useState<Project[]>([]),
    [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    jsonRequest("/api/projects", { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setProjects(result.projects);
        if (!initialProjectId) {
          let stored = "";
          try {
            stored =
              sessionStorage.getItem(
                `matrix-project:${user.workspaceId}:${user.id}`,
              ) ?? "";
          } catch {}
          setProjectId(
            result.projects.some((p: Project) => p.id === stored)
              ? stored
              : (result.projects[0]?.id ?? ""),
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialProjectId, user.workspaceId, user.id, aiDataVersion]);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      setData((current) =>
        current?.project.id === projectId ? current : null,
      );
      await jsonRequest(`/api/projects/${projectId}/artifacts`, {
        signal: controller.signal,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setData(result);
          try {
            sessionStorage.setItem(
              `matrix-project:${user.workspaceId}:${user.id}`,
              projectId,
            );
          } catch {}
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }
    void load();
    return () => controller.abort();
  }, [projectId, attempt, user.workspaceId, user.id, aiDataVersion]);
  return {
    projects,
    projectId,
    setProjectId,
    data,
    loading,
    error,
    notice,
    setNotice,
    reload: () => setAttempt((x) => x + 1),
  };
}
