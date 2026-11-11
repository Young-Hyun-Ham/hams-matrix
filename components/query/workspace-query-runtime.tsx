"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { acquireQueryScope } from "@/lib/query/scope-lifecycle";
import { matrixKeys, type QueryScope } from "@/lib/query/keys";
import { browserGetJson } from "@/lib/query/browser-fetch";
import { createWorkspaceQueryPolicy } from "@/lib/query/policy";
import { defaultSettings } from "@/lib/system-settings/defaults";
import type { SystemSettings } from "@/lib/system-settings/types";
const Context = createContext<{
  scope: QueryScope;
  settings: SystemSettings;
} | null>(null);
export function WorkspaceQueryRuntime({
  scope: inputScope,
  initialSettings,
  children,
}: {
  scope: QueryScope;
  initialSettings: SystemSettings;
  children: ReactNode;
}) {
  const scope = useMemo(
    () => ({ userId: inputScope.userId, workspaceId: inputScope.workspaceId }),
    [inputScope.userId, inputScope.workspaceId],
  );
  const client = useQueryClient();
  const key = matrixKeys.systemSettings(scope);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      browserGetJson<SystemSettings>("/api/me/system-settings", { signal }),
    initialData: initialSettings,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: "always",
  });
  // Keep the last validated snapshot when a recheck is unavailable.
  const settings =
    query.data.source === "unavailable"
      ? (client.getQueryData<SystemSettings>([...key, "last-valid"]) ??
        initialSettings)
      : query.data;
  useEffect(() => {
    if (query.data.source !== "unavailable")
      client.setQueryData(
        [...matrixKeys.systemSettings(scope), "last-valid"],
        query.data,
      );
  }, [client, query.data, scope]);
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({
        queryKey: matrixKeys.systemSettings(scope),
      });
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`matrix-system-settings:${scope.workspaceId}`)
        : null;
    if (channel) channel.onmessage = refresh;
    document.addEventListener("visibilitychange", visible);
    return () => {
      channel?.close();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, scope]);
  useEffect(() => acquireQueryScope(client, scope), [client, scope]);
  const value = useMemo(() => ({ scope, settings }), [scope, settings]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkspaceQueryPolicy(fallbackScope?: QueryScope) {
  const runtime = useContext(Context);
  const rawScope = runtime?.scope ??
    fallbackScope ?? { userId: "", workspaceId: "" };
  const scope = useMemo(
    () => ({ userId: rawScope.userId, workspaceId: rawScope.workspaceId }),
    [rawScope.userId, rawScope.workspaceId],
  );
  const fallback = useMemo(
    () => defaultSettings(scope.workspaceId),
    [scope.workspaceId],
  );
  const settings = runtime?.settings ?? fallback;
  const policy = useMemo(
    () => createWorkspaceQueryPolicy(settings),
    [settings],
  );
  return { scope, settings, policy };
}
