"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";
import type { TeamMember } from "@/lib/project-types";
import "./team-membership.css";
type JoinRequest = {
  id: string;
  name: string;
  teamName: string;
  status: string;
  requestedAt: string;
};
const labels: Record<string, string> = {
  pending: "승인 대기",
  approved: "승인 완료",
  rejected: "거절됨",
};

export function TeamMembership({ user }: { user: User }) {
  const router = useRouter();
  const owner = user.accountRole === "owner" && user.role === "owner";
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        const responses = await Promise.all([
          fetch("/api/team/requests", {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/team/members", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        const data = await Promise.all(
          responses.map((response) => response.json()),
        );
        for (let i = 0; i < responses.length; i++)
          if (!responses[i].ok) throw new Error(data[i].error);
        setRequests(data[0].requests);
        setMembers(data[1].members);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "팀 정보를 조회하지 못했습니다.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [user.workspaceId, attempt]);
  async function review(id: string, status: "approved" | "rejected") {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      const response = await fetch("/api/team/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAttempt((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "처리하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel team-membership">
      <div className="panel-heading">
        <div>
          <h2>{user.workspaceName}</h2>
          <p>
            {owner
              ? "팀 가입 신청을 검토하고 구성원을 확인하세요."
              : "팀 가입 상태와 함께하는 구성원을 확인하세요. user는 조회 전용입니다."}
          </p>
        </div>
        <button
          className="button"
          disabled={loading || !!busy}
          onClick={() => {
            setAttempt((value) => value + 1);
            router.refresh();
          }}
        >
          새로고침
        </button>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">팀 정보를 불러오는 중입니다.</p>
      ) : (
        <div className="team-membership-columns">
          <div>
            <h3>{owner ? "팀 가입 신청" : "내 가입 신청"}</h3>
            {requests.length ? (
              requests.map((item) => (
                <article className="team-request" key={item.id}>
                  <div>
                    <strong>{owner ? item.name : item.teamName}</strong>
                    <small>
                      {labels[item.status]} ·{" "}
                      {new Intl.DateTimeFormat("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "short",
                        day: "numeric",
                      }).format(new Date(item.requestedAt))}
                    </small>
                  </div>
                  {owner && item.status === "pending" ? (
                    <div className="team-request-actions">
                      <button
                        className="button primary"
                        disabled={!!busy}
                        onClick={() => review(item.id, "approved")}
                      >
                        {busy === item.id ? "처리 중…" : "승인"}
                      </button>
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={() => review(item.id, "rejected")}
                      >
                        거절
                      </button>
                    </div>
                  ) : (
                    <span className="badge gray">{labels[item.status]}</span>
                  )}
                </article>
              ))
            ) : (
              <p>
                {owner
                  ? "아직 가입 신청이 없습니다."
                  : "가입 신청이 없는 Guest 계정입니다."}
              </p>
            )}
            {!owner && requests.some((item) => item.status === "pending") && (
              <p>
                owner 승인 전에는 팀 프로젝트를 조회할 수 없습니다. 승인 후
                새로고침하면 팀으로 이동합니다.
              </p>
            )}
          </div>
          <div>
            <h3>팀 구성원 · {members.length}명</h3>
            {members.map((member) => (
              <div className="team-request" key={member.id}>
                <strong>
                  {member.name}
                  {member.id === user.id ? " (나)" : ""}
                </strong>
                <span className="badge gray">
                  {member.role === "owner" ? "owner" : "조회 전용"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
