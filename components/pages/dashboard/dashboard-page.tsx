"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";
import type { Project } from "@/lib/project-types";
import type { Artifact } from "@/lib/artifact-types";
import { CreateProjectDialog } from "./create-project-dialog";
import "@/components/project-workbench.css";
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
  const [projects, setProjects] = useState<Project[]>([]),
    [activities, setActivities] = useState<Activity[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [attempt, setAttempt] = useState(0);
  const canCreate =
    ["owner", "admin", "member"].includes(user.role);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      await fetch("/api/projects", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (controller.signal.aborted) return;
          setProjects(data.projects);
          setActivities(data.activities ?? []);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }
    void load();
    return () => controller.abort();
  }, [attempt, user.workspaceId, user.id]);
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
          <button className="button primary" onClick={() => setCreating(true)}>
            새 프로젝트
          </button>
        )}
      </div>
      {loading ? (
        <p role="status">프로젝트를 불러오는 중입니다.</p>
      ) : error ? (
        <div role="alert" className="matrix-error">
          {error}{" "}
          <button className="button" onClick={() => setAttempt((x) => x + 1)}>
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
            setAttempt((x) => x + 1);
          }}
        />
      )}
    </div>
  );
}
