"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { HelpContent } from "./help-content";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/stores/workspace";
import {
  navigationMenus,
  personalTabs,
  adminTabs,
  superAdminTabs,
  canUseNavigation,
} from "@/lib/menus";
import {
  projectSections,
  projectTabLabels,
  type ProjectTab,
} from "@/lib/project-tabs";
import type { User } from "@/lib/types";
import { Brand, Icon } from "./icon";
import { ThemeToggle } from "./theme-toggle";
import { AiChatbotToggle } from "./ai/ai-conversation-menu";
import { AiWorkspaceLayout } from "./ai/ai-workspace-layout";
import { emptyAiContext } from "@/lib/ai-context";

import { HeaderNotifications } from "./header-notifications";
import { SuperNotifications } from "./super-admin/notifications";
import { WorkspacePlanGuard } from "./workspace-plan-guard";
import { WorkspacePicker } from "./workspace-picker";
import { teamAccessDeniedEvent } from "@/lib/team-request";
import { NavigationTooltip } from "./shared/navigation-tooltip";
import { toast } from "@/stores/toast";
export function WorkspaceShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const { sidebarOpen, setSidebarOpen, search, setSearch, setUser } =
    useWorkspace();
  const { setAiContext, setAiMenuOpen } = useWorkspace();
  const activeUser = useWorkspace((s) => s.user) ?? user;
  const [modal, setModal] = useState<"help" | null>(null),
    [error, setError] = useWorkspaceErrorState(""),
    [busy, setBusy] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const logoutPending = useRef(false);
  const logoutCollapsed = useRef(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const collapsed = !isMobile && !desktopSidebarOpen;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const query = useSearchParams();
  const tooltipResetKey = `${pathname}?${query}:${isMobile}:${desktopSidebarOpen}:${sidebarOpen}:${modal}`;
  const menus = navigationMenus.filter((m) => canUseNavigation(m, activeUser));
  const selected = menus.find((m) => m.href === pathname) ?? menus[0];
  const tabLabels: Record<string, string> | null =
    pathname === "/settings"
      ? personalTabs
      : pathname === "/super-admin/settings"
        ? superAdminTabs
        : pathname === "/admin/settings"
          ? adminTabs
          : null;
  const tab =
    query.get("tab") ??
    (pathname === "/settings"
      ? "usage"
      : pathname === "/admin/settings"
        ? "members"
        : "plans");
  const menu = {
    ...selected,
    label: tabLabels
      ? `${selected.label} · ${tabLabels[tab] ?? Object.values(tabLabels)[0]}`
      : selected.label,
  };
  const titleHref = pathname.startsWith("/projects/")
    ? pathname
    : pathname === "/admin/settings" ||
        pathname === "/super-admin/settings" ||
        pathname === "/settings"
      ? `${pathname}?tab=${tab}`
      : selected.action === "link"
        ? selected.href
        : pathname;
  const projectRoute =
    pathname.startsWith("/projects/") ||
    Object.hasOwn(projectSections, pathname.slice(1));
  const requestedProjectTab = query.get("tab");
  const projectTab: ProjectTab =
    requestedProjectTab && Object.hasOwn(projectTabLabels, requestedProjectTab)
      ? (requestedProjectTab as ProjectTab)
      : (projectSections[pathname.slice(1)] ?? "overview");
  function tabHref(value: string) {
    const params = new URLSearchParams(query.toString());
    params.set("tab", value);
    return `${pathname}?${params.toString()}`;
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches && !desktopSidebarOpen && error) {
        toast(error, true);
        setError("");
      }
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [desktopSidebarOpen, error, setError]);
  useEffect(() => {
    setUser(user);
  }, [user, setUser]);
  const {
    scope: queryScope,
    policy,
    settings,
  } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const queryClient = useQueryClient();
  const seenPath = useRef(pathname);
  const meQuery = useQuery({
    queryKey: matrixKeys.me(queryScope),
    queryFn: ({ signal }) => requestJson<{ user: User }>("/api/me", { signal }),
    ...policy,
    refetchOnWindowFocus: "always",
  });
  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        return await requestJson("/api/auth/logout", { method: "POST" });
      } catch (e) {
        if (!(e instanceof RequestError && e.status === 401)) throw e;
      }
    },
    retry: false,
  });
  useEffect(() => {
    if (meQuery.isError) {
      setUser({ ...(meQuery.data?.user ?? user), teamSharingEnabled: false });
      return;
    }
    if (meQuery.data?.user) {
      setUser(meQuery.data.user);
      if (
        pathname === "/team" &&
        meQuery.data.user.plan === meQuery.data.user.workspacePlan &&
        !meQuery.data.user.teamSharingEnabled
      )
        router.replace("/settings/subscription?reason=team-sharing");
    }
  }, [meQuery.data, meQuery.isError, pathname, router, setUser, user]);
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden)
        void queryClient.invalidateQueries({
          queryKey: matrixKeys.me(queryScope),
        });
    };
    if (seenPath.current !== pathname) {
      seenPath.current = pathname;
      refresh();
    }
    window.addEventListener(teamAccessDeniedEvent, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(teamAccessDeniedEvent, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [queryClient, queryScope, pathname]);
  useEffect(() => {
    if (
      pathname.startsWith("/projects/") ||
      [
        "/requirements",
        "/screens",
        "/specifications",
        "/history",
        "/deliverables",
      ].includes(pathname)
    )
      return;
    setAiContext({ ...emptyAiContext, pathname, screen: menu.label });
  }, [pathname, menu.label, setAiContext]);
  useEffect(() => {
    if (modal) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [modal]);
  useEffect(() => {
    const original = document.body.style.overflow;
    if (isMobile && sidebarOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isMobile, sidebarOpen]);
  useEffect(() => {
    // Async logout results must use the current layout, not the click-time one.
    logoutCollapsed.current = collapsed;
  }, [collapsed]);
  function toggleNavigation() {
    if (isMobile) {
      setSidebarOpen(!sidebarOpen);
    } else {
      if (desktopSidebarOpen) {
        setAiMenuOpen(false);
        // Restore focus after any conversation dialog/list has unmounted.
        requestAnimationFrame(() => menuToggleRef.current?.focus());
        if (error) {
          toast(error, true);
          setError("");
        }
      }
      setDesktopSidebarOpen(!desktopSidebarOpen);
    }
  }
  function openModal(value: "help") {
    setError("");
    setModal(value);
  }
  async function logout() {
    if (logoutPending.current) return;
    logoutPending.current = true;
    setBusy(true);
    setError("");
    try {
      await logoutMutation.mutateAsync();
      await queryClient.cancelQueries();
      queryClient.clear();
      setUser(null);
      router.replace("/login");
      router.refresh();
    } catch (e) {
      const message = resolveWorkspaceError(e, settings.errorMessages);
      if (logoutCollapsed.current)
        toast(e instanceof RequestError ? e : message, true);
      else setError(message);
    } finally {
      logoutPending.current = false;
      setBusy(false);
    }
  }
  const renderMenus = (items: typeof menus) =>
    items.map((m) =>
      m.key === "ai" ? (
        <AiChatbotToggle
          key={`${m.key}:${activeUser.id}:${activeUser.workspaceId}`}
          collapsed={collapsed}
          onExpand={() => setDesktopSidebarOpen(true)}
          tooltipResetKey={tooltipResetKey}
          label={m.label}
        />
      ) : m.action === "help" ? (
        <NavigationTooltip
          key={m.key}
          label={m.label}
          resetKey={tooltipResetKey}
        >
          <button
            className="nav-item secondary"
            aria-label={m.label}
            onClick={() => openModal("help")}
          >
            <Icon name={m.icon} size={19} />
            <span className="nav-label">{m.label}</span>
          </button>
        </NavigationTooltip>
      ) : (
        <NavigationTooltip
          key={m.key}
          label={m.label}
          resetKey={tooltipResetKey}
        >
          <Link
            aria-label={m.label}
            href={m.href}
            className={`nav-item ${m.key === menu.key ? "active" : ""}`}
            aria-current={m.key === menu.key ? "page" : undefined}
            onClick={() => {
              setSidebarOpen(false);
              setSearch("");
            }}
          >
            <Icon name={m.icon} size={19} />
            <span className="nav-label">{m.label}</span>
            {m.key === "dashboard" && <span className="nav-dot" />}
            {m.key === "team" && <span className="nav-new">NEW</span>}
          </Link>
        </NavigationTooltip>
      ),
    );
  return (
    <div
      className={`workspace ${desktopSidebarOpen ? "" : "sidebar-collapsed"}`}
    >
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      {isMobile && sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="메뉴 닫기"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
        inert={isMobile && !sidebarOpen}
      >
        <div className="sidebar-content">
          <Link
            href="/dashboard"
            className="sidebar-brand"
            aria-label="HAMS Matrix 대시보드"
            onClick={() => setSidebarOpen(false)}
          >
            <Brand />
          </Link>
          <p className="nav-caption">WORKSPACE</p>
          <nav aria-label="메인 메뉴">
            {renderMenus(
              menus.filter(
                (m) =>
                  m.key !== "subscription" &&
                  m.key !== "admin" &&
                  m.key !== "super-admin" &&
                  m.key !== "settings" &&
                  m.key !== "viewer" &&
                  m.key !== "help",
              ),
            )}
          </nav>
          <div className="sidebar-bottom">
            <nav aria-label="계정 및 도움말 메뉴">
              {renderMenus(
                menus.filter(
                  (m) =>
                    m.key === "subscription" ||
                    m.key === "admin" ||
                    m.key === "super-admin" ||
                    m.key === "settings" ||
                    m.key === "viewer" ||
                    m.key === "help",
                ),
              )}
            </nav>
            <div className="sidebar-user">
              <div className="user-avatar">{activeUser.name.charAt(0)}</div>
              <button
                className="user-summary"
                onClick={() => {
                  router.push("/settings?tab=account");
                  setSidebarOpen(false);
                }}
              >
                <strong>{activeUser.name}</strong>
                <span>{activeUser.email ?? "소셜 계정"}</span>
              </button>
              <NavigationTooltip label="로그아웃" resetKey={tooltipResetKey}>
                <button
                  onClick={logout}
                  disabled={busy}
                  className="icon-button sidebar-logout"
                  aria-label="로그아웃"
                >
                  <Icon name="logout" size={17} />
                </button>
              </NavigationTooltip>
            </div>
            {error && !modal && !collapsed && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <nav className="breadcrumb" aria-label="현재 위치">
            <button
              ref={menuToggleRef}
              className="icon-button menu-toggle"
              onClick={toggleNavigation}
              aria-label={
                isMobile
                  ? sidebarOpen
                    ? "메뉴 닫기"
                    : "메뉴 열기"
                  : desktopSidebarOpen
                    ? "메뉴 축소"
                    : "메뉴 펼치기"
              }
              aria-expanded={isMobile ? sidebarOpen : desktopSidebarOpen}
              aria-controls="workspace-navigation"
            >
              <Icon name="menu" />
            </button>
            <Link className="breadcrumb-workspace" href="/dashboard">
              워크스페이스
            </Link>
            <Icon name="chevron" size={13} />
            <Link
              className="breadcrumb-title"
              href={
                projectRoute
                  ? tabHref("overview")
                  : tabLabels
                    ? pathname
                    : titleHref
              }
              aria-current={!projectRoute && !tabLabels ? "page" : undefined}
            >
              {projectRoute ? "프로젝트 작업 공간" : selected.label}
            </Link>
            {(projectRoute || tabLabels) && (
              <>
                <Icon name="chevron" size={13} />
                <Link
                  className="breadcrumb-title"
                  href={tabHref(
                    projectRoute
                      ? projectTab
                      : tabLabels && Object.hasOwn(tabLabels, tab)
                        ? tab
                        : pathname === "/settings"
                          ? "usage"
                          : "plans",
                  )}
                  aria-current="page"
                >
                  {projectRoute
                    ? projectTabLabels[projectTab]
                    : (tabLabels?.[tab] ?? Object.values(tabLabels ?? {})[0])}
                </Link>
              </>
            )}
          </nav>
          <div className="topbar-tools">
            <label className="global-search">
              <Icon name="search" size={17} />
              <input
                placeholder="메뉴 검색"
                aria-label="메뉴 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span>⌕</span>
            </label>
            <span className="topbar-divider" />
            <ThemeToggle />
            {activeUser.accountRole === "master" && <SuperNotifications />}
            <HeaderNotifications user={activeUser} />
            {/* <button
              className="topbar-avatar"
              onClick={() => {
                router.push("/settings?tab=account");
                setSidebarOpen(false);
              }}
              aria-label="내 계정 설정"
            >
              {activeUser.name.charAt(0)}
            </button> */}
            <WorkspacePicker current={activeUser.workspaceId} />
          </div>
          {search && (
            <div className="search-results">
              {menus
                .filter((m) =>
                  `${m.label} ${m.en}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .map((m) => (
                  <Link
                    href={m.action === "link" ? m.href : pathname}
                    key={m.key}
                    onClick={(e) => {
                      setSearch("");
                      if (m.action === "help") {
                        e.preventDefault();
                        openModal("help");
                      }
                      if (m.key === "ai") {
                        e.preventDefault();
                        setAiMenuOpen(true);
                        if (isMobile) setSidebarOpen(true);
                        else setDesktopSidebarOpen(true);
                      }
                    }}
                  >
                    <Icon name={m.icon} size={16} />
                    {m.label}
                    <Icon name="arrow" size={14} />
                  </Link>
                ))}
              {!menus.some((m) =>
                `${m.label} ${m.en}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ) && <p>일치하는 메뉴가 없습니다.</p>}
            </div>
          )}
        </header>
        <WorkspacePlanGuard user={activeUser}>
          <AiWorkspaceLayout>
            <main
              id="main-content"
              className={`main-content ${pathname === "/admin/settings" || pathname === "/super-admin/settings" ? "admin-main-content" : ""} ${pathname === "/viewer" ? "viewer-main-content" : ""}`}
            >
              {activeUser.role === "viewer" && (
                <p className="sample-notice">
                  {activeUser.workspaceName} · viewer 권한은 조회 전용입니다.
                  {activeUser.teamSharingEnabled &&
                    " 팀 가입 신청 상태는 팀 공유 메뉴에서 확인하세요."}
                </p>
              )}
              {children}
            </main>
            <footer className="workspace-footer">
              <span>© {new Date().getFullYear()} HAMS Matrix</span>
              <span>
                <i /> All systems connected
              </span>
              <Link href="/policies">서비스 안내</Link>
            </footer>
          </AiWorkspaceLayout>
        </WorkspacePlanGuard>
      </div>
      <dialog
        ref={dialogRef}
        className="workspace-dialog admin-detail-dialog workspace-help-dialog"
        aria-labelledby="workspace-help-title"
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <div className="dialog-header admin-detail-header">
          <h2 id="workspace-help-title">함께 만들어 가는 HAMS Matrix</h2>
          <button
            type="button"
            className="button admin-detail-close"
            aria-label="닫기"
            onClick={() => setModal(null)}
          >
            닫기
          </button>
        </div>
        <div className="admin-detail-body">
          <HelpContent />
        </div>
        <div className="project-registration-footer">
          <button
            type="button"
            className="button primary"
            onClick={() => setModal(null)}
          >
            확인
          </button>
        </div>
      </dialog>
    </div>
  );
}
