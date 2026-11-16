"use client";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import type { User } from "@/lib/types";
import { Icon } from "./icon";
import { useNotificationPopover } from "./shared/use-notification-popover";
type Notices = {
  unread: number;
  requests: {
    key: string;
    name: string;
    teamName: string;
    readAt: string | null;
  }[];
  budget: {
    key: string;
    readAt: string | null;
    exceeded: boolean;
    knownTotal: number;
    tokenLimit: number;
    unknownCalls: number;
  };
};
export function HeaderNotifications({ user }: { user: User }) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const { open, setOpen, ref } = useNotificationPopover();
  const countKey = [...matrixKeys.scope(scope), "team", "notification-count"];
  const listKey = [...matrixKeys.scope(scope), "ai", "notifications"];
  const count = useQuery({
    queryKey: countKey,
    queryFn: ({ signal }) =>
      requestJson<{ unread: number }>("/api/me/notifications/count", {
        signal,
      }),
    ...policy,
    enabled: Boolean(scope.userId && scope.workspaceId),
    refetchInterval: 15000,
    refetchOnWindowFocus: "always",
  });
  const list = useQuery({
    queryKey: listKey,
    queryFn: ({ signal }) =>
      requestJson<Notices>("/api/me/notifications", { signal }),
    ...policy,
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const read = useWorkspaceMutation({
    mutationFn: async (key: string) => {
      await client.cancelQueries({ queryKey: countKey, exact: true });
      await client.cancelQueries({ queryKey: listKey, exact: true });
      return requestJson<Notices>("/api/me/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
    },
    retry: false,
    onSuccess: (result) => {
      client.setQueryData(listKey, result);
      client.setQueryData(countKey, { unread: result.unread });
      void client.invalidateQueries({ queryKey: countKey, exact: true });
    },
  });
  const unread = count.data?.unread ?? 0;
  const budget = list.data?.budget;
  const pending = list.data?.requests ?? [];
  const error = read.error ?? list.error ?? count.error;
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
          <span
            className="notification-badge"
            aria-label={`${unread}건 미확인`}
          >
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="notification-popover" id="team-notifications-panel">
          <strong>알림</strong>
          <p className="notification-help">카드를 클릭하면 확인 처리됩니다.</p>
          {Boolean(error) && (
            <p role="alert">
              {resolveWorkspaceError(error, settings.errorMessages)}
            </p>
          )}
          {list.isFetching && !list.data ? (
            <p role="status">알림을 불러오는 중입니다.</p>
          ) : (
            !pending.length &&
            !budget?.exceeded &&
            !error && <p>대기 중인 알림이 없습니다.</p>
          )}
          <div className="notification-cards">
            {budget?.exceeded && (
              <section
                className={`notification-card${budget.readAt ? " is-read" : ""}`}
                aria-label="AI 토큰 제한 초과"
              >
                <button
                  type="button"
                  className="notification-card-content"
                  disabled={read.isPending || Boolean(budget.readAt)}
                  onClick={() => read.mutate(budget.key)}
                >
                  <span className="notification-card-status">
                    {budget.readAt ? "확인함" : "미확인"}
                  </span>
                  <strong>AI 토큰 사용량 제한 초과</strong>
                  <span>
                    현재 워크스페이스 누적 {budget.knownTotal.toLocaleString()}{" "}
                    / {budget.tokenLimit.toLocaleString()} 토큰
                  </span>
                  {budget.unknownCalls > 0 && (
                    <span>사용량 미확인 호출 포함</span>
                  )}
                  <span className="notification-card-hint">
                    사용량이 설정 한도 이하가 되면 사라집니다.
                  </span>
                </button>
                <div className="notification-card-actions">
                  <Link
                    href="/settings?tab=ai"
                    onClick={() => {
                      if (!budget.readAt && !read.isPending)
                        read.mutate(budget.key);
                      setOpen(false);
                    }}
                  >
                    AI 설정 확인
                  </Link>
                  <Link
                    href="/settings?tab=usage"
                    onClick={() => {
                      if (!budget.readAt && !read.isPending)
                        read.mutate(budget.key);
                      setOpen(false);
                    }}
                  >
                    토큰 사용량 보기
                  </Link>
                </div>
              </section>
            )}
            {pending.map((item) => (
              <button
                type="button"
                key={item.key}
                className={`notification-card notification-card-content${item.readAt ? " is-read" : ""}`}
                disabled={read.isPending || Boolean(item.readAt)}
                onClick={() => read.mutate(item.key)}
              >
                <span className="notification-card-status">
                  {item.readAt ? "확인함" : "미확인"}
                </span>
                <strong>
                  {user.role === "owner"
                    ? `${item.name}님의 팀 가입 신청`
                    : `${item.teamName} 가입 신청 검토 대기`}
                </strong>
                <span className="notification-card-hint">
                  가입 신청이 처리되면 사라집니다.
                </span>
              </button>
            ))}
          </div>
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
