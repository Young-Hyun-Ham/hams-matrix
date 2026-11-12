"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileText,
  Files,
  FolderOpen,
  GitCompareArrows,
  Plus,
  Sparkles,
} from "lucide-react";
import type { User } from "@/lib/types";
import type { Plan } from "@/lib/plan-types";
import type { DashboardData } from "@/lib/dashboard-types";
import type { ProjectTab } from "@/lib/project-tabs";
import { definitions } from "@/lib/artifact-types";
import { projectTabLabels } from "@/lib/project-tabs";
import { toast } from "@/stores/toast";
import { useWorkspace } from "@/stores/workspace";
import { CreateProjectDialog } from "./create-project-dialog";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
import "@/styles/project-workbench.css";
import "@/styles/pages/dashboard/dashboard-page.css";

const steps: { title: string; tab: ProjectTab }[] = [
  { title: "RFP 분석", tab: "rfp" },
  { title: "요구사항 구조화", tab: "requirement" },
  { title: "설계 작업", tab: "screen" },
  { title: "변경 이력", tab: "history" },
  { title: "산출물 통합", tab: "export" },
];
const href = (id: string, tab: ProjectTab) =>
  `/projects/${encodeURIComponent(id)}?tab=${tab}`;
const date = (value: string, time = false) =>
  new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  });

export function DashboardPage({ user }: { user: User }) {
  return (
    <DashboardContent key={`${user.id}:${user.workspaceId}`} user={user} />
  );
}
function DashboardContent({ user }: { user: User }) {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("projectId") ?? "";
  const { scope, policy, settings } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const client = useQueryClient();
  const aiDataVersion = useWorkspace((s) => s.aiDataVersion);
  const query = useQuery({
    queryKey: matrixKeys.dashboard(scope, selected),
    queryFn: ({ signal }) =>
      requestJson<DashboardData>(
        `/api/dashboard${selected ? `?projectId=${encodeURIComponent(selected)}` : ""}`,
        { signal },
      ),
    ...policy,
    // A return from project editing must revalidate even with a long workspace staleTime.
    refetchOnMount: "always",
  });
  useEffect(() => {
    if (aiDataVersion)
      void client.invalidateQueries({ queryKey: matrixKeys.dashboards(scope) });
  }, [client, scope, aiDataVersion]);
  const data =
    query.data?.selectedProjectId === (selected || null)
      ? query.data
      : undefined;
  const error = resolveWorkspaceError(query.error, settings.errorMessages);
  const [creating, setCreating] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(false);
  const [createIntent, setCreateIntent] = useState<ProjectTab | null>(null);
  const [picker, setPicker] = useState<ProjectTab | null>(null);
  const pickerDialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const planPending = useRef(false);
  const canCreate = user.accountRole !== "guest";
  useEffect(() => {
    if (picker) pickerDialog.current?.showModal();
  }, [picker]);
  function closePicker() {
    pickerDialog.current?.close();
    setPicker(null);
    returnFocus.current?.focus();
  }
  async function openCreateDialog(intent: ProjectTab | null = null) {
    if (!canCreate || planPending.current) return;
    planPending.current = true;
    setCheckingPlan(true);
    try {
      const info = await client.query({
        queryKey: [...matrixKeys.scope(scope), "subscription"],
        queryFn: ({ signal }) =>
          requestJson<{ plan: Plan; usage: { projects: number } }>(
            "/api/me/subscription",
            { signal },
          ),
        staleTime: 0,
        retry: false,
      });
      const count = Number(info.usage?.projects);
      if (!Number.isFinite(count))
        throw new Error("프로젝트 사용량을 확인하지 못했습니다.");
      if (info.plan.projectLimit !== null && count >= info.plan.projectLimit) {
        toast(
          `${info.plan.name} 플랜은 프로젝트를 ${info.plan.projectLimit}개까지 보유할 수 있습니다.`,
          true,
        );
        return;
      }
      setCreateIntent(intent);
      setCreating(true);
    } catch (failure) {
      toast(
        failure instanceof RequestError
          ? failure
          : failure instanceof Error
            ? failure.message
            : "요금제 정보를 확인하지 못했습니다.",
        true,
      );
    } finally {
      planPending.current = false;
      setCheckingPlan(false);
    }
  }
  function go(tab: ProjectTab, event: MouseEvent<HTMLButtonElement>) {
    if (!data) return;
    returnFocus.current = event.currentTarget;
    const current = data.projects.find((p) => p.id === selected);
    if (current?.readableTabs.includes(tab)) {
      router.push(href(current.id, tab));
      return;
    }
    if (!data.projectOptions.length && canCreate) {
      void openCreateDialog(tab);
      return;
    }
    setPicker(tab);
  }
  function changeProject(id: string) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("projectId", id);
    else next.delete("projectId");
    router.push(`/dashboard${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  const invalid =
    query.error instanceof RequestError && query.error.status === 404;
  const ready = Boolean(data) && !error;
  const summary = data?.summary;
  const stats = [
    {
      label: "참여 프로젝트",
      value: summary?.projects,
      unit: "개",
      detail: "프로젝트별 문서와 작업 현황",
      icon: FolderOpen,
    },
    {
      label: "관리 항목",
      value: summary?.artifacts,
      unit: "개",
      detail: "WBS·요구사항·설계·검증 항목",
      icon: Files,
    },
    {
      label: "검토 중",
      value: summary?.reviewing,
      unit: "건",
      detail: "현재 검토 중 상태의 관리 항목",
      icon: CircleCheck,
    },
    {
      label: "최근 변경",
      value: summary?.recentChanges,
      unit: "건",
      detail:
        summary?.recentChanges === null
          ? "이력 기능 제한"
          : `최근 7일 수정 횟수${summary?.historyLimited ? " · 이력 제공 범위" : ""}`,
      icon: GitCompareArrows,
    },
  ];
  return (
    <div
      className="matrix-workbench matrix-dashboard"
      aria-busy={query.isLoading}
    >
      <div className="matrix-heading dashboard-heading">
        <div>
          <p className="matrix-eyebrow">YOUR PROJECT, ONE DOCUMENT FLOW</p>
          <h1>대시보드</h1>
          <p>프로젝트 문서를 하나의 흐름으로 관리합니다.</p>
        </div>
        <div className="dashboard-actions">
          <label className="dashboard-picker">
            프로젝트 선택
            <select
              value={selected}
              onChange={(e) => changeProject(e.target.value)}
              aria-label="대시보드 프로젝트 선택"
              disabled={!ready}
            >
              <option value="">전체 프로젝트</option>
              {selected &&
                !data?.projectOptions.some((p) => p.id === selected) && (
                  <option value={selected}>선택한 프로젝트</option>
                )}
              {data?.projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {canCreate && (
            <button
              className="button"
              onClick={() => void openCreateDialog()}
              disabled={checkingPlan}
            >
              <Plus size={14} />새 프로젝트
            </button>
          )}
          <button
            className="button primary"
            onClick={(e) => go("rfp", e)}
            disabled={
              !ready ||
              checkingPlan ||
              (!canCreate && !data?.projectOptions.length)
            }
          >
            <Plus size={14} />
            RFP로 시작하기
          </button>
        </div>
      </div>
      {query.isLoading ? (
        <p role="status">대시보드를 불러오는 중입니다.</p>
      ) : error ? (
        <div role="alert" className="panel matrix-section matrix-error">
          <p>
            {invalid
              ? "프로젝트를 찾을 수 없습니다. 접근 가능한 프로젝트를 다시 선택해 주세요."
              : error}
          </p>
          <div className="dashboard-actions">
            <button className="button" onClick={() => void query.refetch()}>
              다시 불러오기
            </button>
            <Link className="button" href="/dashboard">
              전체 프로젝트 보기
            </Link>
          </div>
        </div>
      ) : (
        data && (
          <>
            <section
              className="panel dashboard-workflow"
              aria-label="프로젝트 문서 작업 흐름"
            >
              <div className="dashboard-workflow-top">
                <div className="dashboard-workflow-title">
                  <span className="dashboard-symbol">
                    <Sparkles size={22} />
                  </span>
                  <div>
                    <h2>한 번의 시작, 연결되는 모든 문서</h2>
                    <p>
                      RFP를 출발점으로 요구사항과 설계, 변경 이력까지
                      연결하세요.
                    </p>
                  </div>
                </div>
                <span className="dashboard-badge">DOCUMENT WORKFLOW</span>
              </div>
              <div className="dashboard-steps">
                {steps.map((step, i) => (
                  <button
                    key={step.tab}
                    className="dashboard-step"
                    onClick={(e) => go(step.tab, e)}
                    disabled={
                      !data.projectOptions.some((p) =>
                        p.readableTabs.includes(step.tab),
                      ) && !canCreate
                    }
                  >
                    <span className="dashboard-step-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{step.title}</span>
                    {i < 4 && <ChevronRight size={14} />}
                  </button>
                ))}
              </div>
              <p className="dashboard-help">
                WBS · 아키텍처 · 화면 · 프로그램 · DB 설계를 같은 프로젝트
                안에서 이어가세요.
              </p>
            </section>
            <div className="dashboard-stats">
              {stats.map(({ label, value, unit, detail, icon: Icon }) => (
                <div className="panel dashboard-stat" key={label}>
                  <div>
                    <span>{label}</span>
                    <span className="dashboard-stat-icon">
                      <Icon size={18} />
                    </span>
                  </div>
                  <p className="dashboard-stat-number">
                    {value == null ? "—" : String(value).padStart(2, "0")}
                    <small>{value == null ? "" : unit}</small>
                  </p>
                  <p>{detail}</p>
                </div>
              ))}
            </div>
            <p className="dashboard-help dashboard-range">
              최근 변경: {data.range.startDate} ~ {data.range.endDate}{" "}
              (한국시간)
              {summary?.scopeLimited ? " · 읽기 가능한 항목 기준" : ""}
            </p>
            <section aria-labelledby="dashboard-projects-title">
              <div className="dashboard-section-heading">
                <h2 id="dashboard-projects-title">
                  참여 프로젝트{" "}
                  <span className="dashboard-badge">
                    {data.projects.length}
                  </span>
                </h2>
                <p>프로젝트를 선택해 작업을 이어가세요.</p>
              </div>
              {!data.projects.length ? (
                <div className="panel matrix-section">
                  <p>
                    {canCreate
                      ? "참여 중인 프로젝트가 없습니다. 새 프로젝트를 만들어 시작하세요."
                      : "현재 접근 가능한 프로젝트가 없습니다."}
                  </p>
                  {canCreate && (
                    <button
                      className="button"
                      onClick={() => void openCreateDialog()}
                      disabled={checkingPlan}
                    >
                      새 프로젝트 만들기
                    </button>
                  )}
                </div>
              ) : (
                <div className="dashboard-project-grid">
                  {data.projects.map((p) => {
                    const s = p.stats!;
                    const percent = s.requirements
                      ? Math.round((s.completed / s.requirements) * 100)
                      : 0;
                    return (
                      <article className="panel dashboard-project" key={p.id}>
                        <div className="dashboard-project-top">
                          <span className="dashboard-monogram">
                            {Array.from(p.name.replace(/\s/g, ""))
                              .slice(0, 2)
                              .join("")
                              .toLocaleUpperCase()}
                          </span>
                          <span className="dashboard-badge">{p.status}</span>
                        </div>
                        <h3>
                          {p.readableTabs.includes("overview") ? (
                            <Link href={href(p.id, "overview")}>
                              {p.name}
                              <ArrowUpRight size={14} />
                            </Link>
                          ) : (
                            p.name
                          )}
                        </h3>
                        <p className="dashboard-project-description">
                          {p.description || "프로젝트 설명이 없습니다."}
                        </p>
                        <div className="dashboard-progress-label">
                          <span>요구사항 완료율</span>
                          <span>
                            {s.requirements
                              ? `${s.completed} / ${s.requirements} · ${percent}%`
                              : "요구사항 없음"}
                          </span>
                        </div>
                        <div
                          className="dashboard-progress"
                          role="progressbar"
                          aria-label={`${p.name} 요구사항 완료율`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={percent}
                        >
                          <span style={{ width: `${percent}%` }} />
                        </div>
                        <div className="dashboard-project-bottom">
                          <span>
                            <Clock3 size={13} />
                            {s.acceptanceIssues === undefined
                              ? "검수 확인 범위 제한"
                              : `검수 확인 ${s.acceptanceIssues}건`}
                          </span>
                          <span>참여자 {p.memberCount}명</span>
                        </div>
                        <details className="dashboard-project-details">
                          <summary>작업 현황 자세히 보기</summary>
                          <p>
                            요구사항 {s.requirements} · 화면 {s.screens} ·
                            프로그램 {s.programs} · DB {s.databases} · WBS{" "}
                            {s.wbs}
                          </p>
                          <p>
                            {s.wbsProgress === undefined
                              ? "전체 작업 현황을 확인할 수 없습니다."
                              : `WBS 진척률 ${s.wbsProgress}% · 계획 / 실제 공수 ${s.plannedEffort} / ${s.actualEffort}시간`}
                          </p>
                          {s.acceptanceReady && <p>검수 준비 완료</p>}
                        </details>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            <div className="dashboard-columns">
              <section
                className="panel dashboard-documents"
                aria-labelledby="dashboard-documents-title"
              >
                <div className="dashboard-panel-heading">
                  <div>
                    <h2 id="dashboard-documents-title">최근 산출물</h2>
                    <p>프로젝트의 최신 관리 항목을 확인하세요.</p>
                  </div>
                  <button
                    className="dashboard-text-button"
                    onClick={(e) => go("export", e)}
                    disabled={!data.projects.length}
                  >
                    통합 산출물 보기 <ArrowRight size={14} />
                  </button>
                </div>
                {!data.recentArtifacts.length ? (
                  <p className="dashboard-empty">
                    등록된 관리 항목이 없습니다.
                  </p>
                ) : (
                  <div
                    className="dashboard-table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="최근 산출물 표"
                  >
                    <table>
                      <caption className="dashboard-sr-only">
                        최근 산출물: 문서명, 버전, 상태, 담당자, 최근 수정일,
                        열기
                      </caption>
                      <thead>
                        <tr>
                          {[
                            "문서명",
                            "버전",
                            "상태",
                            "담당자",
                            "최근 수정",
                            "열기",
                          ].map((title) => (
                            <th key={title} scope="col">
                              {title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentArtifacts.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <div className="dashboard-document-cell">
                                <span className="dashboard-document-icon">
                                  <FileText size={17} />
                                </span>
                                <div>
                                  <Link href={href(a.projectId, a.kind)}>
                                    {a.title}
                                  </Link>
                                  <p>
                                    {a.code} · {definitions[a.kind].label} ·{" "}
                                    {a.projectName}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td>v{a.version}</td>
                            <td>
                              <span className="dashboard-badge">
                                {a.status}
                              </span>
                            </td>
                            <td>{a.owner}</td>
                            <td>
                              <time dateTime={a.updatedAt}>
                                {date(a.updatedAt)}
                              </time>
                            </td>
                            <td>
                              <Link
                                href={href(a.projectId, a.kind)}
                                aria-label={`${a.title} ${definitions[a.kind].label} 탭 열기`}
                              >
                                <ChevronRight size={16} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <section
                className="panel dashboard-impact"
                aria-labelledby="dashboard-impact-title"
              >
                <div className="dashboard-panel-heading">
                  <div>
                    <h2 id="dashboard-impact-title">변경 영향 살펴보기</h2>
                    <p>연결된 항목의 버전과 재검증 후보</p>
                  </div>
                  <GitCompareArrows size={18} />
                </div>
                <div className="dashboard-impact-body">
                  {data.impactPreview.candidate ? (
                    <>
                      <span className="dashboard-badge">재검증 후보</span>
                      <h3>{data.impactPreview.candidate.source.title}</h3>
                      <p>
                        {data.impactPreview.candidate.projectName} · 연결 항목이
                        v{data.impactPreview.candidate.baselineVersion}에서 v
                        {data.impactPreview.candidate.source.version}로
                        변경되었습니다.
                      </p>
                      <div className="dashboard-impact-codes">
                        <span>{data.impactPreview.candidate.source.code}</span>
                        <ArrowRight size={13} />
                        <span>{data.impactPreview.candidate.test.code}</span>
                      </div>
                      <p>{data.impactPreview.candidate.test.title}</p>
                      <div className="dashboard-impact-links">
                        {data.projects
                          .find(
                            (p) =>
                              p.id === data.impactPreview.candidate!.projectId,
                          )
                          ?.readableTabs.includes("trace") && (
                          <Link
                            className="button"
                            href={href(
                              data.impactPreview.candidate.projectId,
                              "trace",
                            )}
                          >
                            영향 후보 확인 <ArrowRight size={13} />
                          </Link>
                        )}
                        {data.projects
                          .find(
                            (p) =>
                              p.id === data.impactPreview.candidate!.projectId,
                          )
                          ?.readableTabs.includes("acceptance") && (
                          <Link
                            href={href(
                              data.impactPreview.candidate.projectId,
                              "acceptance",
                            )}
                          >
                            재검증 확인
                          </Link>
                        )}
                      </div>
                    </>
                  ) : (
                    <p>
                      {data.impactPreview.state === "limited"
                        ? "확인 범위 제한: 연결된 항목을 모두 읽을 수 없습니다."
                        : "확인된 재검증 후보가 없습니다."}
                    </p>
                  )}
                  <p className="dashboard-help">
                    승인된 통과 검증의 저장 버전과 현재 연결 버전을 비교합니다.
                    {data.impactPreview.limited &&
                      " 일부 프로젝트는 확인 범위가 제한됩니다."}
                  </p>
                </div>
              </section>
            </div>
            <details className="panel dashboard-activity">
              <summary>최근 프로젝트 활동</summary>
              {!data.recentActivities.length ? (
                <p>
                  {data.summary.historyLimited
                    ? "이력 제공 범위가 제한되어 있거나 기록된 활동이 없습니다."
                    : "아직 등록된 활동이 없습니다."}
                </p>
              ) : (
                <ul>
                  {data.recentActivities.map((a) => (
                    <li key={a.id}>
                      <Link href={href(a.projectId, "history")}>
                        {a.projectName} · {a.code} · {a.title}
                      </Link>
                      <p>
                        {a.actorName} ·{" "}
                        {(
                          {
                            CREATE: "등록",
                            UPDATE: "수정",
                            DELETE: "삭제",
                          } as Record<string, string>
                        )[a.action] ?? a.action}{" "}
                        · {date(a.occurredAt, true)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <div className="panel dashboard-footer">
              <Sparkles size={19} />
              <div>
                <h2>다음 문서도 같은 맥락으로</h2>
                <p>검토한 요구사항을 바탕으로 설계 작업을 이어가세요.</p>
              </div>
              <button
                className="dashboard-text-button"
                onClick={(e) => go("screen", e)}
                disabled={!data.projects.length}
              >
                설계 작업 이어가기 <ArrowRight size={14} />
              </button>
            </div>
          </>
        )
      )}
      {picker && (
        <dialog
          ref={pickerDialog}
          className="workspace-dialog admin-detail-dialog dashboard-navigation-dialog"
          aria-labelledby="dashboard-navigation-title"
          onCancel={(e) => {
            e.preventDefault();
            closePicker();
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closePicker();
          }}
        >
          <div className="dialog-header admin-detail-header">
            <h2 id="dashboard-navigation-title">
              {projectTabLabels[picker]} · 프로젝트 선택
            </h2>
            <button className="button" onClick={closePicker}>
              닫기
            </button>
          </div>
          <div className="dashboard-navigation-options">
            {data?.projectOptions
              .filter((p) => p.readableTabs.includes(picker))
              .map((p) => (
                <Link
                  className="button"
                  key={p.id}
                  href={href(p.id, picker)}
                  onClick={closePicker}
                >
                  {p.name}
                  <ArrowRight size={14} />
                </Link>
              ))}
            {!data?.projectOptions.some((p) =>
              p.readableTabs.includes(picker),
            ) && <p>이 작업에 접근 가능한 프로젝트가 없습니다.</p>}
          </div>
        </dialog>
      )}
      {creating && canCreate && (
        <CreateProjectDialog
          user={user}
          onClose={() => setCreating(false)}
          onCreated={(project) => {
            setCreating(false);
            if (createIntent) router.push(href(project.id, createIntent));
            else void query.refetch();
          }}
        />
      )}
    </div>
  );
}
