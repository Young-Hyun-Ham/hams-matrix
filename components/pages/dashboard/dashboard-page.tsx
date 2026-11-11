"use client";
import Link from "next/link";
import { useState } from "react";
import type { User } from "@/lib/types";
import type { Project } from "@/lib/project-types";
import type { Artifact } from "@/lib/artifact-types";
import type { Plan } from "@/lib/plan-types";
import { toast } from "@/stores/toast";
import { CreateProjectDialog } from "./create-project-dialog";
import "@/components/project-workbench.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
type Activity = {
  id: string;
  action: string;
  actorName: string;
  occurredAt: string;
  projectName: string;
  projectId: string;
  snapshot: Artifact;
};
export function DashboardPage({ user }: { user: User }) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const client = useQueryClient();
  const query = useQuery({
    queryKey: matrixKeys.projects(scope),
    queryFn: ({ signal }) =>
      requestJson<{ projects: Project[]; activities: Activity[] }>(
        "/api/projects",
        { signal },
      ),
    ...policy,
  });
  const projects = query.data?.projects ?? [],
    activities = query.data?.activities ?? [];
  const loading = query.isLoading,
    error = resolveWorkspaceError(query.error, settings.errorMessages);
  const [creating, setCreating] = useState(false),
    [checkingPlan, setCheckingPlan] = useState(false);
  const setAttempt = () => {
    void query.refetch();
  };
  const canCreate = user.accountRole !== "guest";
  async function openCreateDialog() {
    if (checkingPlan) return;
    setCheckingPlan(true);
    try {
      const data = await client.query({
        queryKey: [...matrixKeys.scope(scope), "subscription"],
        queryFn: ({ signal }) =>
          requestJson<{ plan: Plan; usage: { projects: number } }>(
            "/api/me/subscription",
            { signal },
          ),
        staleTime: 0,
        retry: false,
      });
      const plan = data.plan as Plan;
      const count = Number(data.usage?.projects);
      if (!Number.isFinite(count))
        throw new Error("프로젝트 사용량을 확인하지 못했습니다.");
      if (plan.projectLimit !== null && count >= plan.projectLimit) {
        toast(
          `${plan.name} 플랜은 프로젝트를 ${plan.projectLimit}개까지 보유할 수 있습니다.`,
          true,
        );
        return;
      }
      setCreating(true);
    } catch (error) {
      toast(
        error instanceof RequestError
          ? error
          : error instanceof Error
            ? error.message
            : "요금제 정보를 확인하지 못했습니다.",
        true,
      );
    } finally {
      setCheckingPlan(false);
    }
  }
  const requirements = projects.reduce(
      (sum, p) => sum + (p.stats?.requirements ?? 0),
      0,
    ),
    completed = projects.reduce((sum, p) => sum + (p.stats?.completed ?? 0), 0);
  return (
    <div className="matrix-workbench">
      <div className="matrix-heading">
        <div>
          <p className="matrix-eyebrow">HAMS MATRIX</p>
          <h1>{user.name}님의 프로젝트</h1>
          <p>요구사항에서 화면과 프로그램까지, 같은 맥락으로 연결하세요.</p>
        </div>
        {canCreate && (
          <button
            className="button primary"
            onClick={openCreateDialog}
            disabled={checkingPlan}
          >
            새 프로젝트
          </button>
        )}
      </div>
      {loading ? (
        <p role="status">프로젝트를 불러오는 중입니다.</p>
      ) : error ? (
        <div role="alert" className="matrix-error">
          {error}{" "}
          <button className="button" onClick={() => setAttempt()}>
            다시 불러오기
          </button>
        </div>
      ) : (
        <>
          <div className="matrix-stats">
            {[
              { label: "참여 프로젝트", value: projects.length },
              { label: "요구사항", value: requirements },
              {
                label: "화면",
                value: projects.reduce(
                  (sum, p) => sum + (p.stats?.screens ?? 0),
                  0,
                ),
              },
              {
                label: "요구사항 완료율",
                value: `${requirements ? Math.round((completed / requirements) * 100) : 0}%`,
              },
              {
                label: "검수 준비 프로젝트",
                value: projects.filter((p) => p.stats?.acceptanceReady).length,
              },
              {
                label: "검수 확인 항목",
                value: projects.reduce(
                  (n, p) => n + (p.stats?.acceptanceIssues ?? 0),
                  0,
                ),
              },
            ].map((s) => (
              <div className="panel" key={s.label}>
                <span>{s.label}</span>
                <strong>{s.value}</strong>
              </div>
            ))}
          </div>
          <section className="panel matrix-section">
            <h2>내 프로젝트</h2>
            {!projects.length && <p>참여 중인 프로젝트가 없습니다.</p>}
            {projects.map((p) => (
              <article className="matrix-section" key={p.id}>
                <div className="matrix-toolbar">
                  <div>
                    <Link className="text-button" href={`/projects/${p.id}`}>
                      {p.name}
                    </Link>
                    <p>{p.description}</p>
                  </div>
                  <span>{p.status}</span>
                </div>
                <div className="matrix-toolbar">
                  <span>
                    요구사항 {p.stats?.requirements ?? 0} · 화면{" "}
                    {p.stats?.screens ?? 0} · 프로그램 {p.stats?.programs ?? 0}{" "}
                    · DB {p.stats?.databases ?? 0} · WBS {p.stats?.wbs ?? 0} ·
                    참여자 {p.members.length}명
                  </span>
                  <Link className="button" href={`/projects/${p.id}`}>
                    프로젝트 열기
                  </Link>
                </div>
                <p>
                  WBS 진척률 {p.stats?.wbsProgress ?? 0}% · 계획 / 실제 공수{" "}
                  {p.stats?.plannedEffort ?? 0} / {p.stats?.actualEffort ?? 0}
                  시간 ·{" "}
                  {p.stats?.acceptanceReady
                    ? "검수 준비 완료"
                    : `검수 확인 ${p.stats?.acceptanceIssues ?? 0}건`}
                </p>
                <p>
                  요구사항 완료율{" "}
                  {p.stats?.requirements
                    ? Math.round(
                        (p.stats.completed / p.stats.requirements) * 100,
                      )
                    : 0}
                  %
                </p>
              </article>
            ))}
          </section>
          <section className="panel matrix-section">
            <h2>최근 프로젝트 활동</h2>
            {!activities.length && <p>아직 등록된 활동이 없습니다.</p>}
            {activities.map((a) => (
              <div key={a.id}>
                <Link href={`/projects/${a.projectId}`}>
                  {a.projectName} · {a.snapshot.code} · {a.snapshot.title}
                </Link>
                <p>
                  {a.actorName} ·{" "}
                  {
                    (
                      {
                        CREATE: "등록",
                        UPDATE: "수정",
                        DELETE: "삭제",
                      } as Record<string, string>
                    )[a.action]
                  }{" "}
                  ·{" "}
                  {new Date(a.occurredAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </p>
              </div>
            ))}
          </section>
        </>
      )}
      {creating && canCreate && (
        <CreateProjectDialog
          user={user}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setAttempt();
          }}
        />
      )}
    </div>
  );
}
