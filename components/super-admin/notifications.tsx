"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import { Icon } from "../icon";
import { useNotificationPopover } from "../shared/use-notification-popover";
type Notice = {
  id: string;
  requestId: string;
  company_name: string;
  read_at: string | null;
};
type Notices = { notifications: Notice[]; unread: number };
export function SuperNotifications() {
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const queryKey = matrixKeys.notifications(scope);
  const countKey = [...queryKey, "count"];
  const { open, setOpen, ref } = useNotificationPopover();
  const count = useQuery({
    queryKey: countKey,
    queryFn: ({ signal }) =>
      requestJson<{ unread: number }>("/api/super-admin/notifications/count", {
        signal,
      }),
    ...policy,
    enabled: Boolean(scope.userId && scope.workspaceId),
    refetchInterval: 15000,
    refetchOnWindowFocus: "always",
  });
  const list = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      requestJson<Notices>("/api/super-admin/notifications", { signal }),
    ...policy,
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const mutation = useMutation({
    mutationFn: (id: string) =>
      requestJson(`/api/super-admin/notifications/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    retry: false,
    onSuccess: (_, id) => {
      client.setQueryData<Notices>(queryKey, (current) =>
        current
          ? {
              ...current,
              notifications: current.notifications.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      read_at: item.read_at ?? new Date().toISOString(),
                    }
                  : item,
              ),
            }
          : current,
      );
      // Read status is idempotent; obtain the exact count rather than decrement twice.
      void client.invalidateQueries({ queryKey: countKey });
      void client.invalidateQueries({
        queryKey,
        exact: true,
        refetchType: "none",
      });
      setOpen(false);
    },
  });
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({
        queryKey: [...matrixKeys.notifications(scope), "count"],
      });
      void client.invalidateQueries({
        queryKey: matrixKeys.notifications(scope),
        exact: true,
        refetchType: "none",
      });
    };
    window.addEventListener("business-notifications-refresh", refresh);
    return () =>
      window.removeEventListener("business-notifications-refresh", refresh);
  }, [client, scope]);
  const unread = count.data?.unread ?? 0;
  const error = resolveWorkspaceError(
    mutation.error ?? list.error,
    settings.errorMessages,
  );
  return (
    <div className="notification-wrap" ref={ref}>
      <button
        className="button notification-trigger"
        aria-label="Business 계약 알림"
        title="계약 알림"
        aria-expanded={open}
        aria-controls="contract-notifications-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="file" size={19} />
        <span className="notification-label">계약 알림</span>
        {unread > 0 && (
          <span
            className="notification-badge"
            aria-label={`${unread}건 미확인`}
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="notification-popover" id="contract-notifications-panel">
          <strong>Business 계약 신청</strong>
          {error && <p role="alert">{error}</p>}
          {list.isFetching ? (
            <p role="status">알림을 불러오는 중입니다.</p>
          ) : (
            !list.data?.notifications.length &&
            !error && <p>알림이 없습니다.</p>
          )}
          {list.data?.notifications.map((item) => (
            <p key={item.id}>
              <Link
                href={`/super-admin/settings?tab=business#request-${item.requestId}`}
                onClick={() => {
                  if (!mutation.isPending) mutation.mutate(item.id);
                  setOpen(false);
                }}
              >
                {item.read_at ? "" : "[미확인] "}
                {item.company_name}
              </Link>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
