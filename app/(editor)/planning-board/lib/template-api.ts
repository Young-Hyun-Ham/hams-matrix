"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import { planningFetch } from "./client-api";
import { builtinTemplates, type TemplateSummary } from "../types/templates";

export async function templateRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await planningFetch(path, init, "operation");
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "템플릿 요청을 처리하지 못했습니다.",
    );
  return data as T;
}
export function useProjectTemplates() {
  const projectId = useSearchParams().get("projectId") ?? "";
  const workspaceId = useWorkspace((state) => state.user?.workspaceId);
  const [templates, setTemplates] =
    useState<TemplateSummary[]>(builtinTemplates);
  const [error, setError] = useState("");
  const serial = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    const request = ++serial.current;
    try {
      const data = await templateRequest<{ templates: TemplateSummary[] }>(
        `/api/planning/projects/${encodeURIComponent(projectId)}/templates`,
        { signal: next.signal },
      );
      if (request !== serial.current || next.signal.aborted) return;
      if (!Array.isArray(data.templates))
        throw new Error("템플릿 목록을 확인해 주세요.");
      setTemplates(data.templates);
      setError("");
    } catch (error) {
      if (request === serial.current && !next.signal.aborted)
        setError(
          error instanceof Error ? error.message : "템플릿 목록 조회 실패",
        );
    }
  }, [projectId]);
  const channelName = `matrix-planning-templates:${workspaceId}:${projectId}`;
  useEffect(() => {
    if (!projectId || !workspaceId) return;
    const channel = new BroadcastChannel(channelName);
    const reload = () => {
      void refresh();
    };
    reload();
    channel.addEventListener("message", reload);
    window.addEventListener("focus", reload);
    return () => {
      controller.current?.abort();
      channel.close();
      window.removeEventListener("focus", reload);
    };
  }, [projectId, workspaceId, channelName, refresh]);
  const notify = () => {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "templates-changed" });
    channel.close();
    void refresh();
  };
  return { projectId, templates, error, refresh, notify };
}
