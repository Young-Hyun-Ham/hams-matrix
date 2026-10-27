"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useWorkspace } from "@/stores/workspace";
import { menus } from "@/lib/menus";
import type { User } from "@/lib/types";
import { Brand, Icon } from "./icon";
import { ThemeToggle } from "./theme-toggle";
import { AiChatbotToggle } from "./ai/ai-conversation-menu";
import { AiWorkspaceLayout } from "./ai/ai-workspace-layout";
import { emptyAiContext } from "@/lib/ai-context";
import { AiTokenStatistics } from "./ai/ai-token-statistics";
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
  const [modal, setModal] = useState<"profile" | "help" | null>(null),
    [notifications, setNotifications] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [accountTab, setAccountTab] = useState("usage");
  const adminPage = pathname.startsWith("/admin/ai-guardrails");
  const menu = adminPage ? { ...menus[0], key: "guardrails", label: "AI 가드레일 관리" } : menus.find((m) => pathname === `/${m.key}`) ?? menus[0];
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
  function openModal(value: "profile" | "help") {
    setError("");
    setSuccess("");
    setAccountTab("usage");
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
  async function saveProfile(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.get("name") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setUser(result.user);
      setSuccess("이름을 변경했습니다.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workspace">
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
          {/* 
          <div className="workspace-select">
            <div className="workspace-avatar">
              {activeUser.workspaceName.charAt(0)}
            </div>
            <div>
              <strong>{activeUser.workspaceName}</strong>
              <span>개인 워크스페이스 · {activeUser.plan.toUpperCase()}</span>
            </div>
            <Icon name="lock" size={14} />
          </div>
          */}
          <p className="nav-caption">WORKSPACE</p>
          <nav aria-label="메인 메뉴">
            {menus.map((m) =>
              m.key === "ai" ? (
                <AiChatbotToggle
                  key={`${m.key}:${activeUser.id}:${activeUser.workspaceId}`}
                />
              ) : (
                <Link
                  key={m.key}
                  href={`/${m.key}`}
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
            )}
          </nav>
          <div className="sidebar-bottom">
            {["owner", "admin"].includes(activeUser.role) && <Link className={`nav-item secondary ${pathname.startsWith("/admin/ai-guardrails") ? "active" : ""}`} href="/admin/ai-guardrails" onClick={() => setSidebarOpen(false)}><Icon name="lock" size={18} />AI 가드레일 관리</Link>}
            <button
              className="nav-item secondary"
              onClick={() => openModal("profile")}
            >
              <Icon name="settings" size={18} />
              계정 설정
            </button>
            <button
              className="nav-item secondary"
              onClick={() => openModal("help")}
            >
              <Icon name="help" size={18} />
              도움말 및 서비스 안내
            </button>
            <div className="sidebar-user">
              <div className="user-avatar">{activeUser.name.charAt(0)}</div>
              <button
                className="user-summary"
                onClick={() => openModal("profile")}
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
          <div className="breadcrumb">
            <button
              className="icon-button menu-toggle"
              onClick={() => setSidebarOpen(true)}
              aria-label="메뉴 열기"
              aria-expanded={sidebarOpen}
              aria-controls="workspace-navigation"
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumb-workspace">워크스페이스</span>
            <Icon name="chevron" size={13} />
            <strong>
              {pathname.startsWith("/projects/")
                ? "프로젝트 작업 공간"
                : menu.label}
            </strong>
          </div>
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
            <div className="notification-wrap">
              <button
                className="icon-button"
                aria-label="알림"
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
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
            <button
              className="topbar-avatar"
              onClick={() => openModal("profile")}
              aria-label="내 계정 설정"
            >
              {activeUser.name.charAt(0)}
            </button>
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
                    href={m.key === "ai" ? pathname : `/${m.key}`}
                    key={m.key}
                    onClick={(e) => {
                      setSearch("");
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
          <main id="main-content" className="main-content">
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
        className={`workspace-dialog ${modal === "profile" ? "account-dialog" : ""}`}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal(null);
        }}
      >
        <div className="dialog-header">
          <h2>
            {modal === "profile" ? "계정 설정" : "함께 만들어 가는 HAMS Matrix"}
          </h2>
          <button
            className="icon-button"
            aria-label="닫기"
            onClick={() => setModal(null)}
          >
            <Icon name="close" />
          </button>
        </div>
        {modal === "profile" ? (
          <>
            <div
              className="account-tabs"
              role="tablist"
              aria-label="계정 설정 메뉴"
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                const buttons = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button",
                  ),
                );
                const index = buttons.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                event.preventDefault();
                buttons[next]?.click();
                buttons[next]?.focus();
              }}
            >
              <button
                type="button"
                role="tab"
                id="account-usage-tab"
                aria-controls="account-settings-panel"
                aria-selected={accountTab === "usage"}
                tabIndex={accountTab === "usage" ? 0 : -1}
                onClick={() => setAccountTab("usage")}
              >
                토큰 사용량
              </button>
              <button
                type="button"
                role="tab"
                id="account-profile-tab"
                aria-controls="account-settings-panel"
                aria-selected={accountTab === "profile"}
                tabIndex={accountTab === "profile" ? 0 : -1}
                onClick={() => setAccountTab("profile")}
              >
                프로필
              </button>
            </div>
            <div
              className="account-dialog-body"
              role="tabpanel"
              id="account-settings-panel"
              aria-labelledby={
                accountTab === "usage"
                  ? "account-usage-tab"
                  : "account-profile-tab"
              }
            >
              {accountTab === "usage" ? (
                <AiTokenStatistics
                  key={`${activeUser.workspaceId}:${activeUser.id}`}
                />
              ) : (
                <form onSubmit={saveProfile} className="settings-form">
                  <p className="muted">
                    {activeUser.role !== "viewer"
                      ? "팀에서 사용할 프로필 이름을 변경할 수 있습니다."
                      : "viewer 권한은 조회 전용입니다."}
                  </p>
                  <label htmlFor="profile-name">
                    이름
                    <input
                      id="profile-name"
                      name="name"
                      key={activeUser.name}
                      defaultValue={activeUser.name}
                      minLength={2}
                      maxLength={80}
                      required
                      readOnly={activeUser.role === "viewer"}
                    />
                  </label>
                  <label>
                    로그인 계정
                    <input
                      value={activeUser.email ?? "소셜 계정으로 로그인"}
                      readOnly
                    />
                  </label>
                  <div className="settings-info">
                    <Icon name="shield" size={17} />
                    <span>
                      {activeUser.workspaceName}
                      <br />
                      <small>
                        {activeUser.accountRole} ·{" "}
                        {activeUser.plan.toUpperCase()} 플랜
                      </small>
                    </span>
                  </div>
                  {error && (
                    <p className="error-message" role="alert">
                      {error}
                    </p>
                  )}
                  {success && (
                    <p className="success-message" role="status">
                      {success}
                    </p>
                  )}
                  {activeUser.role !== "viewer" && (
                    <button className="button primary" disabled={busy}>
                      {busy ? "저장 중…" : "변경사항 저장"}
                    </button>
                  )}
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="help-content">
            <span className="badge purple">EARLY ACCESS</span>
            <p>
              요구사항부터 산출물까지 프로젝트의 맥락을 연결하는 팀
              워크스페이스입니다.
            </p>
            <p>
              프로젝트별 요구사항·화면·프로그램 관리, 연결 추적과 Excel
              다운로드가 구현되어 있습니다. 대시보드에서 프로젝트를 열어 문서를
              작성하세요.
            </p>
            <p>
              AI 분석, 프로젝트 편집, 파일 업로드, 팀 초대와 구독 결제는 다음
              단계에서 제공할 예정입니다.
            </p>
            <Link href="/policies" className="button">
              서비스 이용 안내
              <Icon name="external" size={15} />
            </Link>
          </div>
        )}
      </dialog>
    </div>
  );
}
