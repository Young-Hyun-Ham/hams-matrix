"use client";
import { useLayoutEffect, useRef } from "react";
import { usePreferences, type Preferences } from "@/stores/preferences";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import { useToasts } from "@/stores/toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { bindPreferencesCommands } from "@/lib/preferences-request";
import type { PreferenceEdits } from "@/stores/preferences";
export function PreferencesRuntime({
  userId,
  initial,
}: {
  userId: string;
  initial: Preferences;
}) {
  const { position, current, initialize, busy } = usePreferences();
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const queryKey = [...matrixKeys.scope(scope), "preferences"];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      requestJson<Preferences>("/api/me/preferences", { signal }),
    ...policy,
    initialData: initial,
    enabled: Boolean(userId && scope.workspaceId),
  });
  const command = useMutation({
    mutationFn: (input: PreferenceEdits & { version: number }) =>
      requestJson<Preferences>("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    retry: false,
    onSuccess: (data) => {
      client.setQueryData(queryKey, data);
    },
  });
  const { items, remove } = useToasts();
  const owner = useRef(Symbol("preferences-runtime"));
  useLayoutEffect(() => {
    if (!busy) initialize(userId, query.data, owner.current);
  }, [userId, query.data, initialize, busy]);
  const { refetch } = query;
  const { mutateAsync } = command;
  useLayoutEffect(
    () =>
      bindPreferencesCommands(owner.current, {
        read: async () => (await refetch({ throwOnError: true })).data!,
        write: mutateAsync,
      }),
    [refetch, mutateAsync],
  );
  useLayoutEffect(() => {
    const token = owner.current;
    return () => {
      if (usePreferences.getState().reset(userId, token))
        useToasts.setState({ items: [] });
    };
  }, [userId]);
  return (
    <div
      style={{
        position: "fixed",
        zIndex: 10000,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(90vw,440px)",
        display: "grid",
        gap: 8,
        ...(position === "top"
          ? { top: 80 }
          : { bottom: "calc(24px + env(safe-area-inset-bottom))" }),
      }}
    >
      {items.map((item) =>
        item.requestError?.scope &&
        (item.requestError.scope.userId !== scope.userId ||
          item.requestError.scope.workspaceId !== scope.workspaceId) ? null : (
          <div
            className="panel"
            style={{
              padding: 16,
              boxShadow: "0 4px 24px #0003",
              backgroundColor: current.toastBackgroundColor,
              color: current.toastFontColor,
            }}
            role={item.error ? "alert" : "status"}
            key={item.id}
          >
            {item.requestError
              ? resolveWorkspaceError(item.requestError, settings.errorMessages)
              : item.text}
            <button
              type="button"
              aria-label="알림 닫기"
              onClick={() => remove(item.id)}
              style={{
                float: "right",
                color: current.toastCloseButtonColor ?? "inherit",
                backgroundColor:
                  current.toastCloseButtonBackgroundColor ?? "ButtonFace",
              }}
            >
              ×
            </button>
          </div>
        ),
      )}
    </div>
  );
}
