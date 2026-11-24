"use client";
import { useConsoleGuard } from "@/components/shared/console-access";
import { useCallback, useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  GuardrailControlTowerDashboard,
  GuardrailRemaining,
} from "./guardrail-control-tower-dashboard";
import { usePageVisible } from "@/components/shared/use-page-visible";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { guardrailNames } from "@/lib/ai/guardrail-rule-catalog";
import {
  approvalStageNames,
  approvalStatusNames,
  type GuardrailApproval,
} from "@/lib/ai/guardrail-approval-types";
import {
  GuardrailApprovalDetail,
  approvalTime,
} from "./guardrail-approval-detail";
import "@/styles/pages/admin/guardrail-control-tower/guardrail-control-tower.css";

const dateKst = (days: number) =>
  new Date(Date.now() + 9 * 3600000 + days * 86400000)
    .toISOString()
    .slice(0, 10);
type Filters = {
  from: string;
  to: string;
  search: string;
  projectId: string;
  stage: string;
  rule: string;
  status: string;
};
type Queue = {
  requests: GuardrailApproval[];
  nextCursor: string | null;
  projects: { id: string; name: string }[];
};
export function GuardrailControlTower({
  workspaceId,
  workspaceName,
  entryProjectId,
  entryProjectName,
  productName,
  initialApprovalId = "",
  initialView = "queue",
  superMode = false,
}: {
  workspaceId: string;
  workspaceName: string;
  entryProjectId: string;
  entryProjectName: string;
  productName?: string;
  initialApprovalId?: string;
  initialView?: string;
  superMode?: boolean;
}) {
  const visible = usePageVisible();
  const { scope, policy } = useWorkspaceQueryPolicy(),
    client = useQueryClient();
  const root = `/api/${superMode ? "super-admin" : "admin"}/ai-guardrail-approvals`,
    endpoint = `${root}?workspaceId=${encodeURIComponent(workspaceId)}&entryProjectId=${encodeURIComponent(entryProjectId)}`;
  const defaults: Filters = {
    from: dateKst(-6),
    to: dateKst(0),
    search: "",
    projectId: "",
    stage: "",
    rule: "",
    status: "",
  };
  const [filters, setFilters] = useState(defaults),
    [applied, setApplied] = useState(defaults);
  const [tab, setTab] = useState(
      initialView === "history" && !initialApprovalId ? "history" : "pending",
    ),
    [selected, setSelected] = useState(initialApprovalId),
    [cursor, setCursor] = useState("");
  const [previous, setPrevious] = useState<string[]>([]);
  const [navigation, setNavigation] = useState({
    view: initialApprovalId
      ? "queue"
      : initialView === "dashboard"
        ? "dashboard"
        : initialView === "history"
          ? "history"
          : "queue",
    detail: !!initialApprovalId,
  });
  const params = new URLSearchParams({
    workspaceId,
    entryProjectId,
    ...applied,
    tab,
    cursor,
  });
  const list = useQuery({
    queryKey: [
      ...matrixKeys.guardrailApprovals(scope, endpoint),
      "list",
      params.toString(),
    ],
    queryFn: ({ signal }) =>
      requestJson<Queue>(`${root}?${params}`, { signal }),
    ...policy,
    enabled: navigation.view !== "dashboard" && !navigation.detail,
    refetchInterval: () =>
      visible &&
      navigation.view !== "dashboard" &&
      !navigation.detail &&
      tab !== "history"
        ? 15000
        : false,
  });
  const counts = useQuery({
    queryKey: [...matrixKeys.guardrailApprovals(scope, endpoint), "count"],
    queryFn: ({ signal }) =>
      requestJson<Record<string, number>>(
        `${root}/count?workspaceId=${encodeURIComponent(workspaceId)}&entryProjectId=${encodeURIComponent(entryProjectId)}`,
        { signal },
      ),
    ...policy,
    enabled: navigation.view !== "dashboard",
    refetchInterval: () =>
      visible && navigation.view !== "dashboard" ? 15000 : false,
  });
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: matrixKeys.guardrailOverview(
        scope,
        `/api/${superMode ? "super-admin" : "admin"}/ai-guardrail-control-tower/overview?workspaceId=${encodeURIComponent(workspaceId)}&entryProjectId=${encodeURIComponent(entryProjectId)}`,
      ),
    });
    void client.invalidateQueries({
      queryKey: matrixKeys.guardrailApprovals(scope, endpoint),
    });
  };
  function changeTab(value: string) {
    navigate(value === "history" ? "history" : "queue", "", false, value);
  }

  const [menuOpen, setMenuOpen] = useState(false);
  const dirty = useRef(false);
  const queueScroll = useRef(0);
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const protect = () =>
    !dirty.current ||
    window.confirm("작성 중인 처리 의견을 버리고 이동하시겠습니까?");
  const snapshot = () => ({
    ...navigation,
    selected,
    tab,
    filters,
    applied,
    cursor,
    previous,
    scroll: window.scrollY,
  });
  function navigate(
    view: string,
    id = "",
    detail = false,
    tabOverride?: string,
  ) {
    if (!protect()) return;
    const current = snapshot();
    window.history.replaceState(
      { ...window.history.state, tower: current },
      "",
    );
    if (!navigation.detail) queueScroll.current = window.scrollY;
    const next = { view, detail };
    const nextTab =
      tabOverride ??
      (view === "history"
        ? "history"
        : view === "queue" && tab === "history"
          ? "pending"
          : tab);
    setNavigation(next);
    setSelected(id);
    setTab(nextTab);
    setMenuOpen(false);
    const queueState =
      nextTab !== tab || tabOverride
        ? {
            cursor: "",
            previous: [] as string[],
            filters: { ...filters, status: "" },
            applied: { ...applied, status: "" },
          }
        : { cursor, previous, filters, applied };
    setCursor(queueState.cursor);
    setPrevious(queueState.previous);
    setFilters(queueState.filters);
    setApplied(queueState.applied);
    const url = new URL(window.location.href);
    url.searchParams.set("view", view);
    if (detail && id) url.searchParams.set("approvalId", id);
    else url.searchParams.delete("approvalId");
    window.history.pushState(
      {
        ...window.history.state,
        tower: {
          ...current,
          ...next,
          selected: id,
          tab: nextTab,
          ...queueState,
          scroll: detail ? 0 : queueScroll.current,
        },
      },
      "",
      url,
    );
    window.scrollTo(
      0,
      detail || view === "dashboard" ? 0 : queueScroll.current,
    );
  }
  function choose(id: string, detail = true) {
    if (!detail) {
      if (protect()) setSelected(id);
      return;
    }
    navigate(navigation.view === "history" ? "history" : "queue", id, true);
  }
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      if (!protect()) {
        const url = new URL(window.location.href);
        url.searchParams.set("view", navigation.view);
        if (navigation.detail && selected)
          url.searchParams.set("approvalId", selected);
        else url.searchParams.delete("approvalId");
        window.history.pushState(
          { ...window.history.state, tower: snapshot() },
          "",
          url,
        );
        return;
      }
      const value = event.state?.tower;
      if (value) {
        setNavigation({ view: value.view, detail: value.detail });
        setSelected(value.selected);
        setTab(value.tab);
        setFilters(value.filters);
        setApplied(value.applied);
        setCursor(value.cursor);
        setPrevious(value.previous);
        requestAnimationFrame(() => window.scrollTo(0, value.scroll ?? 0));
      } else {
        const url = new URL(window.location.href),
          id = url.searchParams.get("approvalId") ?? "";
        const view = id ? "queue" : (url.searchParams.get("view") ?? "queue");
        setNavigation({ view, detail: !!id });
        setSelected(id);
        setTab(view === "history" ? "history" : "pending");
      }
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  });
  useConsoleGuard(list.error ?? counts.error);
  const preview = !list.isError
    ? list.data?.requests.find((r) => r.id === selected)
    : undefined;
  const title = navigation.detail
    ? "승인 요청 상세·처리"
    : navigation.view === "dashboard"
      ? "관제 대시보드"
      : navigation.view === "history"
        ? "처리 이력"
        : "승인 대기열";
  return (
    <main className="guardrail-control-tower">
      <aside className={`guardrail-tower-nav${menuOpen ? " is-open" : ""}`}>
        <div className="guardrail-tower-brand">
          Control Tower<span>GUARDRAIL OPERATIONS</span>
        </div>
        <nav aria-label="컨트롤타워 메뉴" id="tower-navigation">
          {[
            ["dashboard", "관제 대시보드"],
            ["queue", "승인 대기열"],
            ["history", "처리 이력"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-current={navigation.view === key ? "page" : undefined}
              onClick={() => navigate(key)}
            >
              {label}
              {key === "queue" && counts.data && (
                <span className="tower-badge">{counts.data.pending}</span>
              )}
            </button>
          ))}
          <a
            href={`/${superMode ? "super-admin" : "admin"}/settings?tab=guardrails`}
            target="_blank"
            rel="noopener noreferrer"
          >
            가드레일 정책 ↗
          </a>
        </nav>
        <p className="tower-nav-scope">
          {productName ?? "현재 상품"}
          <br />
          {workspaceName}
        </p>
      </aside>
      <div className="guardrail-tower-workspace">
        <header className="guardrail-tower-header">
          <button
            className="button tower-menu-toggle"
            aria-controls="tower-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            메뉴
          </button>
          <div className="tower-header-title">
            <h1>{title}</h1>
            <span>{workspaceName}</span>
          </div>
          <div className="tower-header-actions">
            <span className="tower-updated">
              {list.dataUpdatedAt
                ? approvalTime(new Date(list.dataUpdatedAt).toISOString())
                : "관제 데이터"}
            </span>
            <button className="button" onClick={refresh}>
              새로고침
            </button>
            <ThemeToggle />
          </div>
        </header>
        <div id="tower-content" className="guardrail-tower-content">
          <p className="tower-scope">
            상품: {productName ?? "현재 워크스페이스 관리"} <span> / </span>{" "}
            워크스페이스: <strong>{workspaceName}</strong> · 전체 관제 · 진입
            확인 프로젝트: {entryProjectName}
          </p>
          {navigation.view === "dashboard" && !navigation.detail ? (
            <GuardrailControlTowerDashboard
              entryProjectId={entryProjectId}
              workspaceId={workspaceId}
              superMode={superMode}
              onSelect={(id) => choose(id)}
            />
          ) : navigation.detail ? (
            <GuardrailApprovalDetail
              key={selected}
              id={selected}
              endpoint={endpoint}
              onChanged={refresh}
              onBack={() => navigate(navigation.view, selected)}
              onDirtyChange={onDirtyChange}
            />
          ) : (
            <>
              <div className="tower-queue-heading">
                <div>
                  <h2>
                    {navigation.view === "history"
                      ? "처리 이력"
                      : "승인 대기열"}
                  </h2>
                  <p>요청을 선택한 뒤 상세 검토에서 개별 승인·반려합니다.</p>
                </div>
                <span>
                  현재 workspace 전체 · 승인 대기{" "}
                  {counts.isError ? "조회 실패" : (counts.data?.pending ?? "—")}
                  건
                </span>
              </div>
              <div
                className="guardrail-tower-tabs"
                role="tablist"
                aria-label="요청 상태"
              >
                {[
                  ["pending", "승인 대기"],
                  ["approved", "승인 후 재개 대기"],
                  ["history", "처리 이력"],
                ].map(([key, label]) => (
                  <button
                    id={`tower-tab-${key}`}
                    type="button"
                    key={key}
                    role="tab"
                    aria-selected={tab === key}
                    aria-controls="tower-list-panel"
                    onClick={() => changeTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <form
                className="guardrail-tower-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  setApplied(filters);
                  setCursor("");
                  setPrevious([]);
                }}
              >
                <label>
                  시작일 (KST)
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) =>
                      setFilters({ ...filters, from: e.target.value })
                    }
                  />
                </label>
                <label>
                  종료일 (KST)
                  <input
                    type="date"
                    value={filters.to}
                    min={filters.from}
                    onChange={(e) =>
                      setFilters({ ...filters, to: e.target.value })
                    }
                  />
                </label>
                <label>
                  요청자 이름/이메일
                  <input
                    value={filters.search}
                    maxLength={100}
                    onChange={(e) =>
                      setFilters({ ...filters, search: e.target.value })
                    }
                  />
                </label>
                <label>
                  프로젝트
                  <select
                    value={filters.projectId}
                    onChange={(e) =>
                      setFilters({ ...filters, projectId: e.target.value })
                    }
                  >
                    <option value="">전체</option>
                    <option value="none">프로젝트 없음</option>
                    {list.data?.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  정책
                  <select
                    value={filters.rule}
                    onChange={(e) =>
                      setFilters({ ...filters, rule: e.target.value })
                    }
                  >
                    <option value="">전체</option>
                    {Object.entries(guardrailNames).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  검사 단계
                  <select
                    value={filters.stage}
                    onChange={(e) =>
                      setFilters({ ...filters, stage: e.target.value })
                    }
                  >
                    <option value="">전체</option>
                    {Object.entries(approvalStageNames).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {tab === "history" && (
                  <label>
                    상태
                    <select
                      value={filters.status}
                      onChange={(e) =>
                        setFilters({ ...filters, status: e.target.value })
                      }
                    >
                      <option value="">전체</option>
                      {[
                        "resuming",
                        "completed",
                        "rejected",
                        "cancelled",
                        "expired",
                        "invalidated",
                        "reblocked",
                        "failed",
                      ].map((s) => (
                        <option key={s} value={s}>
                          {approvalStatusNames[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button className="button">검색</button>
                <button
                  className="button"
                  type="button"
                  onClick={() => {
                    setFilters(defaults);
                    setApplied(defaults);
                    setCursor("");
                    setPrevious([]);
                  }}
                >
                  초기화
                </button>
              </form>

              <div className="guardrail-tower-columns">
                <section
                  id="tower-list-panel"
                  className="guardrail-tower-list"
                  role="tabpanel"
                  aria-labelledby={`tower-tab-${tab}`}
                >
                  <h2>승인 요청 목록</h2>
                  {list.isPending && (
                    <p role="status">요청을 불러오고 있습니다.</p>
                  )}
                  {list.isError && (
                    <p role="alert">
                      목록을 조회하지 못했습니다. 권한과 검색 조건을 확인한 뒤
                      새로고침해 주세요.
                    </p>
                  )}
                  {!list.isError && list.data && (
                    <>
                      {!list.data.requests.length && (
                        <p>
                          {tab === "pending" && counts.data?.pending === 0
                            ? "현재 승인 대기 요청이 없습니다."
                            : tab === "approved" && counts.data?.approved === 0
                              ? "현재 승인 후 재개 대기 요청이 없습니다."
                              : "현재 검색 조건에 해당하는 요청이 없습니다."}
                        </p>
                      )}
                      <div className="guardrail-tower-table">
                        <table>
                          <thead>
                            <tr>
                              <th>요청 시각</th>
                              <th>요청자 / 프로젝트</th>
                              <th>차단 정책 / 단계</th>
                              <th>상태 / 만료</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.data.requests.map((r) => (
                              <tr
                                key={r.id}
                                className={
                                  selected === r.id ? "is-selected" : ""
                                }
                              >
                                <td>
                                  <button
                                    className="guardrail-request-link"
                                    onClick={() => choose(r.id, false)}
                                    aria-label={`${r.userName}의 ${r.policies.map((p) => p.displayName).join(", ")} 승인 요청 상세`}
                                  >
                                    {approvalTime(r.requestedAt)}
                                  </button>
                                </td>
                                <td>
                                  {r.userName}
                                  <br />
                                  {r.projectName} / {r.targetPage}
                                </td>
                                <td>
                                  {r.policies
                                    .map((p) => p.displayName)
                                    .join(", ")}
                                  <br />
                                  {approvalStageNames[r.stage]}
                                </td>
                                <td>
                                  {approvalStatusNames[r.status]}
                                  <br />
                                  {approvalTime(r.expiresAt)}
                                  <br />
                                  <GuardrailRemaining
                                    expiresAt={r.expiresAt}
                                    status={r.status}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="guardrail-button-row">
                        <button
                          className="button"
                          disabled={!previous.length}
                          onClick={() => {
                            setCursor(previous.at(-1) ?? "");
                            setPrevious(previous.slice(0, -1));
                          }}
                        >
                          이전
                        </button>
                        <button
                          className="button"
                          disabled={!list.data.nextCursor}
                          onClick={() => {
                            setPrevious([...previous, cursor]);
                            setCursor(list.data!.nextCursor!);
                          }}
                        >
                          다음
                        </button>
                      </div>
                    </>
                  )}
                </section>

                <section
                  className="guardrail-request-preview"
                  aria-label="요청 미리보기"
                >
                  <h2>요청 미리보기</h2>
                  {preview ? (
                    <>
                      <span className="tower-status">
                        {approvalStatusNames[preview.status]}
                      </span>
                      <h3>
                        {preview.policies.map((p) => p.displayName).join(", ")}
                      </h3>
                      <dl>
                        <dt>요청자</dt>
                        <dd>{preview.userName}</dd>
                        <dt>프로젝트</dt>
                        <dd>{preview.projectName}</dd>
                        <dt>검사 단계</dt>
                        <dd>{approvalStageNames[preview.stage]}</dd>
                        <dt>만료</dt>
                        <dd>
                          {approvalTime(preview.expiresAt)}
                          <br />
                          <GuardrailRemaining
                            expiresAt={preview.expiresAt}
                            status={preview.status}
                          />
                        </dd>
                      </dl>
                      <button
                        className="button tower-primary"
                        onClick={() => choose(preview.id)}
                      >
                        상세 검토
                      </button>
                      <p>차단 근거와 적용 범위를 확인한 뒤 처리합니다.</p>
                    </>
                  ) : (
                    <p>목록에서 승인 요청을 선택해 주세요.</p>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
