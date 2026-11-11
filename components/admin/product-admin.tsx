"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState } from "react";
import { GuardrailAdmin } from "./guardrail-admin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
type Product = {
  id: string;
  name: string;
  plan_code: string;
  member_limit: number | null;
};
type Member = {
  id: string;
  name: string;
  email: string;
  role?: string;
  accountRole?: string;
  version: number;
  planMatches?: number;
};
type Entry = {
  id: string;
  source: string;
  occurredAt: string;
  actorName: string;
  action: string;
};
export function ProductAdmin({
  product,
  base,
  tab = "members",
  superMode = false,
  workspaceMode = false,
}: {
  product: Product;
  base: string;
  tab?: string;
  superMode?: boolean;
  workspaceMode?: boolean;
}) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const detailDialog = useRef<HTMLDialogElement>(null);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const detail = useQuery({
    queryKey: [
      ...matrixKeys.scope(scope),
      "admin",
      base,
      "history",
      selectedEntry?.source,
      selectedEntry?.id,
    ],
    enabled: !!selectedEntry,
    queryFn: ({ signal }) =>
      requestJson<{ beforeJson: unknown; afterJson: unknown }>(
        `${base}/history/${selectedEntry!.source}/${selectedEntry!.id}`,
        { signal },
      ),
    ...policy,
  });
  useEffect(() => {
    if (selectedEntry) detailDialog.current?.showModal();
    else detailDialog.current?.close();
  }, [selectedEntry]);
  const [candidate, setCandidate] = useState<Member | null>(null);
  const [email, setEmail] = useState(""),
    [projectId, setProjectId] = useState(""),
    [workspaceId, setWorkspaceId] = useState(""),
    [q, setQ] = useState(""),
    [search, setSearch] = useState("");
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [localError, setError] = useWorkspaceErrorState(""),
    [notice, setNotice] = useState("");
  const overviewQuery = useQuery({
    queryKey: [...matrixKeys.scope(scope), "admin", base, "overview"],
    queryFn: ({ signal }) =>
      requestJson<{
        used: number;
        projects: { id: string; name: string }[];
        workspaces: { id: string; name: string }[];
      }>(base, { signal }),
    ...policy,
  });
  const listing = useQuery({
    enabled: tab !== "guardrails",
    queryKey: [
      ...matrixKeys.scope(scope),
      "admin",
      base,
      tab === "history" ? "history" : "members",
      { page, pageSize: 20, q: search, projectId },
    ],
    queryFn: ({ signal }) =>
      requestJson<{ members?: Member[]; entries?: Entry[]; total: number }>(
        `${base}/${tab === "history" ? "history" : "members"}?${new URLSearchParams({ page: String(page), pageSize: "20", q: search, projectId })}`,
        { signal },
      ),
    ...policy,
  });
  const overview = overviewQuery.data,
    members = listing.data?.members ?? [],
    entries = listing.data?.entries ?? [],
    total = listing.data?.total ?? 0;
  const error =
    localError ||
    resolveWorkspaceError(
      overviewQuery.error ?? listing.error,
      settings.errorMessages,
    );
  const command = useMutation({
    mutationFn: (input: object) =>
      requestJson(`${base}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    retry: false,
  });
  useEffect(() => {
    if (!revision) return;
    void client.invalidateQueries({
      queryKey: [...matrixKeys.scope(scope), "admin", base],
    });
  }, [client, scope, base, revision]);
  async function mutate(member: Member, action: "grant" | "revoke") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await command.mutateAsync({
        userId: member.id,
        action,
        version: member.version,
      });
      setNotice(
        action === "grant"
          ? "상품 지원을 확정했습니다. 일반 회원의 역할은 user로 유지됩니다."
          : "상품 지원을 회수했습니다.",
      );
      setCandidate(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const selectedWorkspace = workspaceId || overview?.workspaces[0]?.id || "";
  return (
    <section className="panel" style={{ padding: 20 }}>
      <h2>{product.name}</h2>
      <p>
        {workspaceMode ? "워크스페이스 회원" : "상품 회원"}{" "}
        {overview?.used ?? "…"}
        {!workspaceMode && <> / {product.member_limit ?? "무제한"}</>}
        {product.plan_code === "team" && "명 (관리자 포함)"}
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {tab !== "guardrails" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(q);
          }}
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <input
            aria-label={
              tab === "history" ? "이력 작업자 검색어" : "회원 검색어"
            }
            placeholder={
              tab === "history"
                ? "작업자 이름·이메일"
                : workspaceMode
                  ? "워크스페이스 회원 이름·이메일"
                  : "상품 회원 이름·이메일"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            aria-label="프로젝트 필터"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {workspaceMode ? "현재 워크스페이스 전체" : "현재 상품 전체"}
            </option>
            <option value="unassigned">프로젝트 미배정</option>
            {overview?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="button">검색</button>
        </form>
      )}
      {tab === "guardrails" ? (
        <>
          <label>
            대상 워크스페이스{" "}
            <select
              value={selectedWorkspace}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              {overview?.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          {selectedWorkspace ? (
            <GuardrailAdmin
              key={selectedWorkspace}
              workspaceName={
                overview?.workspaces.find((w) => w.id === selectedWorkspace)
                  ?.name ?? ""
              }
              endpoint={`${superMode ? "/api/super-admin" : "/api/admin"}/ai-guardrails?workspaceId=${encodeURIComponent(selectedWorkspace)}`}
            />
          ) : (
            <p>이 상품으로 워크스페이스를 만든 후 정책을 관리해 주세요.</p>
          )}
        </>
      ) : tab === "history" ? (
        <>
          <h3>{workspaceMode ? "워크스페이스 이력" : "상품 이력"}</h3>
          <p>작업자 이름·이메일과 현재 프로젝트 배정 상태로 검색합니다.</p>
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>작업자</th>
                <th>작업</th>
                <th>상세</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={`${e.source}:${e.id}`}>
                  <td>
                    {new Date(e.occurredAt).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                  </td>
                  <td>{e.actorName}</td>
                  <td>{e.action}</td>
                  <td>
                    <button
                      className="button"
                      onClick={() => setSelectedEntry(e)}
                    >
                      상세 보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>이메일</th>
                <th>역할</th>
                <th>상품 상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.email}</td>
                  <td>
                    {m.accountRole} / {m.role}
                  </td>
                  <td>{m.planMatches ? "일치" : "구독 확인 필요"}</td>
                  <td>
                    {!workspaceMode &&
                      m.role === "member" &&
                      m.accountRole === "user" && (
                        <button
                          disabled={busy}
                          className="button"
                          onClick={() => void mutate(m, "revoke")}
                        >
                          지원 회수
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!members.length && <p>검색 결과가 없습니다.</p>}
          {!workspaceMode && (
            <>
              <h3>일반 유저 검색·추가</h3>
              <p>
                가입한 이메일 전체로 조회합니다. 다른 상품 회원과 관리자는
                검색되지 않습니다.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  setCandidate(null);
                  try {
                    const d = await client.query({
                      queryKey: [
                        ...matrixKeys.scope(scope),
                        "admin",
                        base,
                        "candidates",
                        email.trim().toLowerCase(),
                      ],
                      queryFn: ({ signal }) =>
                        requestJson<{ members: Member[] }>(
                          `${base}/candidates?email=${encodeURIComponent(email)}`,
                          { signal },
                        ),
                      ...policy,
                    });
                    setCandidate(d.members[0] ?? null);
                    if (!d.members.length)
                      setNotice("지원 가능한 일반 회원이 없습니다.");
                  } catch (e) {
                    setError(e);
                  }
                }}
                style={{ display: "flex", gap: 8 }}
              >
                <input
                  type="email"
                  aria-label="일반 유저 이메일"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button className="button">일반 유저 검색</button>
              </form>
              {candidate && (
                <p>
                  {candidate.name} · {candidate.email}{" "}
                  <button
                    disabled={busy}
                    className="button primary"
                    onClick={() => void mutate(candidate, "grant")}
                  >
                    {product.plan_code === "business" ? "Business" : "Team"}{" "}
                    상품 지원 확정
                  </button>
                </p>
              )}
            </>
          )}
        </>
      )}
      {tab === "history" && !listing.isPending && !entries.length && (
        <p>검색 결과가 없습니다.</p>
      )}
      <dialog
        ref={detailDialog}
        className="workspace-dialog admin-detail-dialog"
        aria-labelledby="product-history-detail-title"
        onCancel={(event) => {
          event.preventDefault();
          setSelectedEntry(null);
        }}
        onClose={() => setSelectedEntry(null)}
      >
        <div className="dialog-header admin-detail-header">
          <h2 id="product-history-detail-title">이력 상세</h2>
          <button
            className="button admin-detail-close"
            onClick={() => setSelectedEntry(null)}
          >
            닫기
          </button>
        </div>
        <div className="admin-detail-body">
          {selectedEntry && (
            <p>
              {selectedEntry.actorName} · {selectedEntry.action} ·{" "}
              {new Date(selectedEntry.occurredAt).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </p>
          )}
          {detail.isError ? (
            <p role="alert">
              {resolveWorkspaceError(detail.error, settings.errorMessages)}{" "}
              <button className="button" onClick={() => void detail.refetch()}>
                다시 조회
              </button>
            </p>
          ) : detail.data ? (
            <>
              <h3>변경 전</h3>
              <pre className="admin-history-json">
                {JSON.stringify(detail.data.beforeJson, null, 2)}
              </pre>
              <h3>변경 후</h3>
              <pre className="admin-history-json">
                {JSON.stringify(detail.data.afterJson, null, 2)}
              </pre>
            </>
          ) : (
            <p role="status">상세 조회 중…</p>
          )}
        </div>
      </dialog>
      {tab !== "guardrails" && (
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <button
            className="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </button>
          <span>
            {page} / {Math.max(1, Math.ceil(total / 20))}
          </span>
          <button
            className="button"
            disabled={page * 20 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </button>
        </div>
      )}
    </section>
  );
}
