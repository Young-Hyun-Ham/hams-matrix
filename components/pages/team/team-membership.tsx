"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";
import type { TeamMember } from "@/lib/project-types";
import "./team-membership.css";

type JoinRequest = { id: string; name: string; teamName: string; status: string; requestedAt: string };
const labels: Record<string, string> = { pending: "승인 대기", approved: "승인 완료", rejected: "거절됨" };
export function TeamMembership({ user, projectId, onChanged, refreshVersion = 0 }: { user: User; projectId: string; onChanged: () => void; refreshVersion?: number }) {
  const router = useRouter();
  const [requests, setRequests] = useState<JoinRequest[]>([]), [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true), [canManage, setCanManage] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null);
  const transferDialog = useRef<HTMLDialogElement>(null);
  const mutationBusy = useRef(false);
  const teamOwner = user.role === "owner" && (!!projectId || canManage);
  useEffect(() => {
    if (transferTarget) transferDialog.current?.showModal();
    else transferDialog.current?.close();
  }, [transferTarget]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const responses = await Promise.all([fetch("/api/team/requests", { cache: "no-store", signal: controller.signal }), fetch(`/api/team/members${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, { cache: "no-store", signal: controller.signal })]);
        const results = await Promise.all(responses.map(response => response.json()));
        for (let i = 0; i < responses.length; i++) if (!responses[i].ok) throw new Error(results[i].error);
        if (!controller.signal.aborted) { setRequests(results[0].requests); setMembers(results[1].members); setCanManage(results[1].canManage); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "팀 정보를 조회하지 못했습니다."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [user.workspaceId, projectId, attempt, refreshVersion]);
  async function mutate(path: string, method: string, data: unknown, key: string) {
    if (mutationBusy.current) return false;
    mutationBusy.current = true;
    setBusy(key); setError(""); setNotice("");
    try {
      const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if ((data as { role?: string }).role === "owner") setCanManage(false);
      setAttempt(value => value + 1); setNotice("변경 내용을 반영했습니다."); onChanged(); router.refresh();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "처리하지 못했습니다."); return false; }
    finally { mutationBusy.current = false; setBusy(""); }
  }
  function changeRole(member: TeamMember, role: string) {
    if (role === member.role) return;
    if (role === "owner") { setError(""); setTransferTarget(member); return; }
    void mutate("/api/team/members", "PATCH", { projectId, userId: member.id, role, expectedRole: member.role, expectedOwnerId: user.id, confirmTransfer: role === "owner" }, member.id);
  }
  return <section className="panel team-membership">
    <div className="panel-heading"><div><h2>{projectId ? "프로젝트 구성원" : "팀 구성원"} · {members.length}명</h2><p>{projectId ? "프로젝트 owner만 권한 변경과 소유권 양도를 할 수 있습니다." : "팀 소속 권한입니다. 프로젝트별 권한과 소유권은 프로젝트를 선택해 관리합니다."}</p></div><button className="button" disabled={loading || !!busy} onClick={() => { setAttempt(value => value + 1); onChanged(); router.refresh(); }}>새로고침</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">구성원을 불러오고 있습니다.</p> : <div className="team-membership-columns">
      <div><h3>{teamOwner ? "팀 가입 신청" : "내 가입 신청"}</h3>{requests.length ? requests.map(item => <article className="team-request" key={item.id}><div><strong>{teamOwner ? item.name : item.teamName}</strong><small>{labels[item.status]} · {new Date(item.requestedAt).toLocaleDateString("ko-KR")}</small></div>{teamOwner && item.status === "pending" ? <div className="team-request-actions"><button className="button primary" disabled={!!busy} onClick={() => void mutate("/api/team/requests", "PATCH", { id: item.id, status: "approved" }, item.id)}>승인 · member</button><button className="button" disabled={!!busy} onClick={() => void mutate("/api/team/requests", "PATCH", { id: item.id, status: "rejected" }, item.id)}>거절</button></div> : <span className="badge gray">{labels[item.status]}</span>}</article>) : <p>가입 신청이 없습니다.</p>}
      </div>
      <div><h3>{projectId ? "프로젝트 권한" : "팀 소속 권한"}</h3>{members.map(member => <div className="team-request" key={member.id}><div><strong>{member.name}{member.id === user.id ? " (나)" : ""}</strong><small>{member.jobTitle || "담당 역할 미등록"}</small></div>{canManage && member.role !== "owner" ? <select aria-label={`${member.name} 권한`} value={member.role} disabled={!!busy} onChange={event => changeRole(member, event.target.value)}><option value="owner">owner · 소유권 이전</option><option value="admin">admin</option><option value="member">member</option><option value="viewer">viewer · 조회 전용</option></select> : <span className="badge gray">{member.role}</span>}</div>)}</div>
    </div>}
    <dialog ref={transferDialog} className="team-compose-dialog team-transfer-dialog" aria-labelledby="team-transfer-title" onCancel={event => { event.preventDefault(); if (!mutationBusy.current) { setTransferTarget(null); setError(""); } }}>
      <h2 id="team-transfer-title">owner 권한 이전</h2>
      <p><strong>{transferTarget?.name}</strong>님에게 {projectId ? "이 프로젝트" : user.workspaceName}의 owner 권한을 이전하시겠습니까?</p>
      <p className="team-transfer-warning">이전 후 현재 소유자는 member로 변경되며, 구성원 권한을 관리할 수 없습니다.</p>
      {!projectId && <p>기존 프로젝트별 소유권은 유지됩니다.</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="team-modal-actions"><button type="button" className="button" disabled={!!busy} onClick={() => { setTransferTarget(null); setError(""); }}>취소</button><button type="button" className="button primary" disabled={!!busy || !transferTarget} onClick={async () => {
        if (!transferTarget) return;
        const saved = await mutate("/api/team/members", "PATCH", { projectId, userId: transferTarget.id, role: "owner", expectedRole: transferTarget.role, expectedOwnerId: user.id, confirmTransfer: true }, "transfer");
        if (saved) setTransferTarget(null);
      }}>{busy === "transfer" ? "이전 중…" : "이전"}</button></div>
    </dialog>
  </section>;
}
