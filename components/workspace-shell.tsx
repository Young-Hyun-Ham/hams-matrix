"use client";
import { HelpContent } from "./help-content";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/stores/workspace";
import { navigationMenus, personalTabs, adminTabs } from "@/lib/menus";
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

import { isPlatformAdmin } from "@/lib/plan-types";
import { WorkspacePicker } from "./workspace-picker";
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
    [notifications, setNotifications] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const query = useSearchParams();
  const menus = navigationMenus.filter(
    (m) => !m.admin || isPlatformAdmin(activeUser.accountRole),
  );
  const selected = menus.find((m) => m.href === pathname) ?? menus[0];
  const tabLabels: Record<string, string> | null =
    pathname === "/settings"
      ? personalTabs
      : pathname === "/admin/settings"
        ? adminTabs
        : null;
  const tab =
    query.get("tab") ?? (pathname === "/settings" ? "usage" : "plans");
  const menu = {
    ...selected,
    label: tabLabels
      ? `${selected.label} · ${tabLabels[tab] ?? Object.values(tabLabels)[0]}`
      : selected.label,
  };
  const titleHref = pathname.startsWith("/projects/")
    ? pathname
    : pathname === "/admin/settings" || pathname === "/settings"
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
  const notificationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!notifications) return;

    function handleOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !notificationRef.current?.contains(event.target)
      ) {
        setNotifications(false);
      }
    }

    document.addEventListener("pointerdown", handleOutside, true);

    return () => {
      document.removeEventListener("pointerdown", handleOutside, true);
    };
  }, [notifications]);
  function tabHref(value: string) {
    const params = new URLSearchParams(query.toString());
    params.set("tab", value);
    return `${pathname}?${params.toString()}`;
  }
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    setUser(user);
  }, [user, setUser]);
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
    if (sidebarOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [sidebarOpen]);
  function openModal(value: "help") {
    setError("");
    setModal(value);
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401)
        throw new Error("로그아웃하지 못했습니다. 다시 시도해 주세요.");
      setUser(null);
      router.replace("/login");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  const renderMenus = (items: typeof menus) =>
    items.map((m) =>
      m.key === "ai" ? (
        <AiChatbotToggle
          key={`${m.key}:${activeUser.id}:${activeUser.workspaceId}`}
        />
      ) : m.action === "help" ? (
        <button
          className="nav-item secondary"
          key={m.key}
          onClick={() => openModal("help")}
        >
          <Icon name={m.icon} size={19} />
          {m.label}
        </button>
      ) : (
        <Link
          key={m.key}
          href={m.href}
          className={`nav-item ${m.key === menu.key ? "active" : ""}`}
          aria-current={m.key === menu.key ? "page" : undefined}
          onClick={() => {
            setSidebarOpen(false);
            setSearch("");
          }}
        >
          <Icon name={m.icon} size={19} />
          {m.label}
          {m.key === "dashboard" && <span className="nav-dot" />}
          {m.key === "team" && <span className="nav-new">NEW</span>}
        </Link>
      ),
    );
  return (
    <div
      className={`workspace ${desktopSidebarOpen ? "" : "sidebar-collapsed"}`}
    >
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-overlay"
          aria-label="메뉴 닫기"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
      >
        <div className="sidebar-content">
          <Link
            href="/dashboard"
            className="sidebar-brand"
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
                  m.key !== "settings" &&
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
                    m.key === "settings" ||
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
              <button
                onClick={logout}
                disabled={busy}
                className="icon-button"
                aria-label="로그아웃"
              >
                <Icon name="logout" size={17} />
              </button>
            </div>
            {error && !modal && (
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
              className="icon-button menu-toggle"
              onClick={() =>
                isMobile
                  ? setSidebarOpen(!sidebarOpen)
                  : setDesktopSidebarOpen(!desktopSidebarOpen)
              }
              aria-label={
                (isMobile ? sidebarOpen : desktopSidebarOpen)
                  ? "메뉴 닫기"
                  : "메뉴 열기"
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
            <div className="notification-wrap" ref={notificationRef}>
              <button
                className="icon-button"
                aria-label="알림"
                aria-expanded={notifications}
                onClick={() => setNotifications((open) => !open)}
              >
                <Icon name="bell" size={19} />
              </button>
              {notifications && (
                <div className="notification-popover">
                  <strong>알림</strong>
                  <p>
                    {activeUser.role === "owner"
                      ? "팀 공유 메뉴에서 가입 신청을 검토할 수 있습니다."
                      : "팀 공유 메뉴에서 가입 신청 상태를 확인할 수 있습니다."}
                  </p>
                  <Link href="/team" onClick={() => setNotifications(false)}>
                    팀 가입 신청 확인
                  </Link>
                </div>
              )}
            </div>
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
                        setSidebarOpen(true);
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
        <AiWorkspaceLayout>
          <main
            id="main-content"
            className={`main-content ${pathname === "/admin/settings" ? "admin-main-content" : ""} ${pathname === "/viewer" ? "viewer-main-content" : ""}`}
          >
            {activeUser.role === "viewer" && (
              <p className="sample-notice">
                {activeUser.workspaceName} · viewer 권한은 조회 전용입니다. 팀
                가입 신청 상태는 팀 공유 메뉴에서 확인하세요.
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
        <div className="admin-detail-body"><HelpContent /></div>
        <div className="project-registration-footer"><button type="button" className="button primary" onClick={() => setModal(null)}>확인</button></div>
      </dialog>
    </div>
  );
}
