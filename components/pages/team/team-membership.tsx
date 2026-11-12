"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { notifyProjectAccessChange } from "@/lib/project-access-events";
import type { User } from "@/lib/types";
import type { TeamMember } from "@/lib/project-types";
import "@/styles/pages/team/team-membership.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { teamRequestJson } from "@/lib/query/team-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
import { useTeamMembers } from "@/components/query/use-team-members";

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
export function TeamMembership({
  user,
  projectId,
  onChanged,
  refreshVersion = 0,
}: {
  user: User;
  projectId: string;
  onChanged: () => void;
  refreshVersion?: number;
}) {
  const router = useRouter();
  const { scope, policy, settings } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const client = useQueryClient();
  const membership = useTeamMembers(projectId);
  const joinRequests = useQuery({
    queryKey: [...matrixKeys.scope(scope), "team", "requests"],
    queryFn: ({ signal }) =>
      teamRequestJson<{ requests: JoinRequest[] }>("/api/team/requests", {
        signal,
      }),
    ...policy,
  });
  const requests = joinRequests.data?.requests ?? [],
    members = membership.data?.members ?? [];
  const [transferred, setTransferred] = useState(false);
  const canManage =
    membership.data?.canManage === true && !membership.isError && !transferred;
  const loading = membership.isLoading || joinRequests.isLoading;
  const command = useMutation({
    mutationFn: ({
      path,
      method,
      data,
    }: {
      path: string;
      method: string;
      data: unknown;
    }) =>
      teamRequestJson(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    retry: false,
  });
  const [localError, setError] = useWorkspaceErrorState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null);
  const transferDialog = useRef<HTMLDialogElement>(null);
  const mutationBusy = useRef(false);
  const teamOwner = !projectId && user.role === "owner" && canManage;
  useEffect(() => {
    if (transferTarget && !projectId) transferDialog.current?.showModal();
    else transferDialog.current?.close();
  }, [transferTarget, projectId]);
  const error =
    localError ||
    resolveWorkspaceError(
      membership.error ?? joinRequests.error,
      settings.errorMessages,
    );
  useEffect(() => {
    void client.invalidateQueries({
      queryKey: [...matrixKeys.scope(scope), "team"],
    });
  }, [client, scope, projectId, attempt, refreshVersion]);
  async function mutate(
    path: string,
    method: string,
    data: unknown,
    key: string,
  ) {
    if (mutationBusy.current) return false;
    mutationBusy.current = true;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await command.mutateAsync({ path, method, data });
      if (projectId) notifyProjectAccessChange(projectId);
      if ((data as { role?: string }).role === "owner") setTransferred(true);
      setAttempt((value) => value + 1);
      setNotice("변경 내용을 반영했습니다.");
      onChanged();
      router.refresh();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      mutationBusy.current = false;
      setBusy("");
    }
  }
  function changeRole(member: TeamMember, role: string) {
    if (role === member.role) return;
    if (role === "owner") {
      setError("");
      setTransferTarget(member);
      return;
    }
    void mutate(
      "/api/team/members",
      "PATCH",
      {
        projectId,
        userId: member.id,
        role,
        expectedRole: member.role,
        expectedOwnerId: user.id,
        confirmTransfer: role === "owner",
      },
      member.id,
    );
  }
  return (
    <section className="panel team-membership">
      <div className="panel-heading">
        <div>
          <h2>
            {projectId ? "프로젝트 구성원" : "팀 구성원"} · {members.length}명
          </h2>
          <p>
            {projectId
              ? "프로젝트 owner만 구성원 권한을 변경할 수 있습니다. 프로젝트 소유권은 양도할 수 없습니다."
              : "팀 소속 권한입니다. 프로젝트별 권한과 소유권은 프로젝트를 선택해 관리합니다."}
          </p>
        </div>
        <button
          className="button"
          disabled={loading || !!busy}
          onClick={() => {
            setAttempt((value) => value + 1);
            onChanged();
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
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">구성원을 불러오고 있습니다.</p>
      ) : (
        <div className="team-membership-columns">
          <div>
            <h3>{teamOwner ? "팀 가입 신청" : "내 가입 신청"}</h3>
            {!projectId && requests.length ? (
              requests.map((item) => (
                <article className="team-request" key={item.id}>
                  <div>
                    <strong>{teamOwner ? item.name : item.teamName}</strong>
                    <small>
                      {labels[item.status]} ·{" "}
                      {new Date(item.requestedAt).toLocaleDateString("ko-KR")}
                    </small>
                  </div>
                  {teamOwner && item.status === "pending" ? (
                    <div className="team-request-actions">
                      <button
                        className="button primary"
                        disabled={!!busy}
                        onClick={() =>
                          void mutate(
                            "/api/team/requests",
                            "PATCH",
                            { id: item.id, status: "approved" },
                            item.id,
                          )
                        }
                      >
                        승인 · member
                      </button>
                      <button
                        className="button"
                        disabled={!!busy}
                        onClick={() =>
                          void mutate(
                            "/api/team/requests",
                            "PATCH",
                            { id: item.id, status: "rejected" },
                            item.id,
                          )
                        }
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
              <p>가입 신청이 없습니다.</p>
            )}
          </div>
          <div>
            <h3>{projectId ? "프로젝트 권한" : "팀 소속 권한"}</h3>
            {members.map((member) => (
              <div className="team-request" key={member.id}>
                <div>
                  <strong>
                    {member.name}
                    {member.id === user.id ? " (나)" : ""}
                  </strong>
                  <small>{member.jobTitle || "담당 역할 미등록"}</small>
                </div>
                {canManage && member.role !== "owner" ? (
                  <select
                    aria-label={`${member.name} 권한`}
                    value={member.role}
                    disabled={!!busy}
                    onChange={(event) => changeRole(member, event.target.value)}
                  >
                    {!projectId && (
                      <option value="owner">
                        owner · 워크스페이스 소유권 이전
                      </option>
                    )}
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="viewer">viewer · 조회 전용</option>
                  </select>
                ) : (
                  <span className="badge gray">{member.role}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <dialog
        ref={transferDialog}
        className="team-compose-dialog team-transfer-dialog"
        aria-labelledby="team-transfer-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!mutationBusy.current) {
            setTransferTarget(null);
            setError("");
          }
        }}
      >
        <h2 id="team-transfer-title">owner 권한 이전</h2>
        <p>
          <strong>{transferTarget?.name}</strong>님에게{" "}
          {projectId ? "이 프로젝트" : user.workspaceName}의 owner 권한을
          이전하시겠습니까?
        </p>
        <p className="team-transfer-warning">
          이전 후 현재 소유자는 member로 변경되며, 구성원 권한을 관리할 수
          없습니다.
        </p>
        {!projectId && <p>기존 프로젝트별 소유권은 유지됩니다.</p>}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <div className="team-modal-actions">
          <button
            type="button"
            className="button"
            disabled={!!busy}
            onClick={() => {
              setTransferTarget(null);
              setError("");
            }}
          >
            취소
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!!busy || !transferTarget}
            onClick={async () => {
              if (!transferTarget) return;
              const saved = await mutate(
                "/api/team/members",
                "PATCH",
                {
                  projectId,
                  userId: transferTarget.id,
                  role: "owner",
                  expectedRole: transferTarget.role,
                  expectedOwnerId: user.id,
                  confirmTransfer: true,
                },
                "transfer",
              );
              if (saved) setTransferTarget(null);
            }}
          >
            {busy === "transfer" ? "이전 중…" : "이전"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
