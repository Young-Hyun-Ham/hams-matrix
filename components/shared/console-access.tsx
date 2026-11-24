"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { RequestError } from "@/lib/query/error-messages";
import { projectAccessEvent } from "@/lib/project-access-events";
import type { ConsoleCapability } from "@/lib/ai/intent-classification-types";

type Permission = ConsoleCapability & {
  ownerId?: string;
  projectRole?: string;
};
export function useConsolePermission(
  accessUrl: string,
  workspaceId: string,
  projectId = "",
  intent = false,
) {
  const { scope } = useWorkspaceQueryPolicy();
  const query = useQuery({
    queryKey: matrixKeys.consoleAccess(scope, accessUrl),
    queryFn: async ({ signal }) => {
      const result = await requestJson<Permission>(accessUrl, { signal });
      if (
        result.userId !== scope.userId ||
        result.workspaceId !== workspaceId ||
        (projectId && result.projectId !== projectId)
      )
        throw new RequestError(403, "ACCESS_SCOPE_CHANGED");
      return {
        ...result,
        canOpen: intent
          ? result.ownerId === scope.userId && result.projectRole === "owner"
          : result.canOpen,
      };
    },
    staleTime: 0,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const { refetch } = query;
  useEffect(() => {
    const refresh = () => {
      void refetch();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === projectAccessEvent) refresh();
    };
    window.addEventListener(projectAccessEvent, refresh);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(projectAccessEvent, refresh);
      window.removeEventListener("storage", storage);
    };
  }, [refetch]);
  return query;
}
const Guard = createContext<(error: unknown) => void>(() => {});
export function useConsoleGuard(error?: unknown) {
  const report = useContext(Guard);
  useEffect(() => {
    if (error) report(error);
  }, [error, report]);
  return report;
}
export function ConsoleAccessBoundary({
  accessUrl,
  workspaceId,
  projectId,
  intent = false,
  children,
}: {
  accessUrl: string;
  workspaceId: string;
  projectId: string;
  intent?: boolean;
  children: ReactNode;
}) {
  const query = useConsolePermission(accessUrl, workspaceId, projectId, intent);
  const [denied, setDenied] = useState(false);
  const report = useCallback((error: unknown) => {
    if (
      error instanceof RequestError &&
      [401, 403, 404, 409].includes(error.status ?? 0)
    )
      setDenied(true);
  }, []);
  if (query.isFetching || query.isPending)
    return <p role="status">프로젝트 owner 권한을 확인하고 있습니다.</p>;
  if (denied || query.isError || !query.data?.canOpen)
    return (
      <section role="alert">
        <p>
          프로젝트 owner 권한과 현재 로그인 정보를 확인해 주세요. 표시하던
          데이터는 숨겼습니다.
        </p>
        <button
          className="button"
          onClick={async () => {
            const result = await query.refetch();
            if (!result.isError && result.data?.canOpen) setDenied(false);
          }}
        >
          권한 다시 확인
        </button>
      </section>
    );
  return <Guard.Provider value={report}>{children}</Guard.Provider>;
}
export function ConsoleWindowButton({
  accessUrl,
  workspaceId,
  projectId,
  intent = false,
  href,
  label,
  buttonClassName = "",
  disabled = false,
  onOpened,
}: {
  accessUrl: string;
  workspaceId: string;
  projectId: string;
  intent?: boolean;
  href: string;
  label: string;
  buttonClassName?: string;
  disabled?: boolean;
  onOpened?: () => void;
}) {
  const query = useConsolePermission(accessUrl, workspaceId, projectId, intent);
  const [verified, setVerified] = useState<{
    at: number;
    revision: number;
    url: string;
  } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const ready =
    !!verified &&
    verified.url === accessUrl &&
    verified.revision === query.dataUpdatedAt;
  function open() {
    window.open(
      href,
      "_blank",
      "noopener,noreferrer,popup,width=" +
        Math.min(1440, window.screen.availWidth) +
        ",height=" +
        Math.min(960, window.screen.availHeight) +
        ",resizable=yes,scrollbars=yes",
    );
    setAttempted(true);
    onOpened?.();
  }
  async function click() {
    if (disabled || query.isFetching || !query.data?.canOpen || query.isError)
      return;
    if (ready && verified && Date.now() - verified.at < 15000) {
      open();
      return;
    }
    const result = await query.refetch();
    if (result.isError || !result.data?.canOpen) {
      setVerified(null);
      return;
    }
    setVerified({
      at: Date.now(),
      revision: result.dataUpdatedAt,
      url: accessUrl,
    });
    // Never create a blank window before asynchronous authorization.
    if (navigator.userActivation?.isActive) open();
  }
  const allowed =
    !disabled && !query.isFetching && !query.isError && query.data?.canOpen;
  return (
    <div className="console-window-entry">
      <button
        type="button"
        className={`button ${buttonClassName}`.trim()}
        data-console-window
        disabled={!allowed}
        onClick={() => void click()}
      >
        {ready ? "권한을 확인했습니다. 새창 열기 ↗" : label}
      </button>
      {!allowed && (
        <small role="status">
          {query.isFetching
            ? "owner 권한 확인 중"
            : disabled
              ? "요청 처리 중에는 이동할 수 없습니다."
              : "프로젝트 owner만 새창을 열 수 있습니다."}
        </small>
      )}
      {attempted && (
        <small role="status">
          새창이 보이지 않으면 팝업 허용 후 위 버튼을 다시 눌러 주세요.
        </small>
      )}
    </div>
  );
}
