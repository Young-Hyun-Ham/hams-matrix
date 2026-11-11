"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { User } from "@/lib/types";
import { Icon } from "./icon";
import { useNotificationPopover } from "./shared/use-notification-popover";

type Requests = {
  requests: { id: string; status: string; name: string; teamName: string }[];
};
export function HeaderNotifications({ user }: { user: User }) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const { open, setOpen, ref } = useNotificationPopover();
  const count = useQuery({
    queryKey: [...matrixKeys.scope(scope), "team", "notification-count"],
    queryFn: ({ signal }) =>
      requestJson<{ unread: number }>("/api/me/notifications/count", {
        signal,
      }),
    ...policy,
    enabled: user.teamSharingEnabled,
    refetchInterval: 15000,
    refetchOnWindowFocus: "always",
  });
  const list = useQuery({
    queryKey: [...matrixKeys.scope(scope), "team", "requests"],
    queryFn: ({ signal }) =>
      requestJson<Requests>("/api/team/requests", { signal }),
    ...policy,
    enabled: open && user.teamSharingEnabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const unread = count.data?.unread ?? 0;
  const pending =
    list.data?.requests.filter((item) => item.status === "pending") ?? [];
  return (
    <div className="notification-wrap" ref={ref}>
      <button
        className="icon-button notification-trigger"
        aria-label="알림"
        aria-expanded={open}
        aria-controls="team-notifications-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" size={19} />
        {unread > 0 && (
          <span className="notification-badge" aria-label={`${unread}건 대기`}>
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="notification-popover" id="team-notifications-panel">
          <strong>알림</strong>
          {Boolean(list.error) && (
            <p role="alert">
              {resolveWorkspaceError(list.error, settings.errorMessages)}
            </p>
          )}
          {list.isFetching ? (
            <p role="status">알림을 불러오는 중입니다.</p>
          ) : (
            !pending.length && <p>대기 중인 알림이 없습니다.</p>
          )}
          {pending.map((item) => (
            <p key={item.id}>
              {user.role === "owner"
                ? `${item.name}님의 팀 가입 신청`
                : `${item.teamName} 가입 신청 검토 대기`}
            </p>
          ))}
          {user.teamSharingEnabled && (
            <Link href="/team" onClick={() => setOpen(false)}>
              팀 가입 신청 확인
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
