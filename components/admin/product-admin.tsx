"use client";
import { useEffect, useState } from "react";
import { GuardrailAdmin } from "./guardrail-admin";
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
  const [overview, setOverview] = useState<{
    used: number;
    projects: { id: string; name: string }[];
    workspaces: { id: string; name: string }[];
  } | null>(null);
  const [members, setMembers] = useState<Member[]>([]),
    [entries, setEntries] = useState<Entry[]>([]),
    [candidate, setCandidate] = useState<Member | null>(null);
  const [email, setEmail] = useState(""),
    [projectId, setProjectId] = useState(""),
    [workspaceId, setWorkspaceId] = useState(""),
    [q, setQ] = useState(""),
    [search, setSearch] = useState("");
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: "20",
          q: search,
          projectId,
        });
        const [a, b] = await Promise.all([
          fetch(base, { cache: "no-store", signal: c.signal }),
          fetch(
            `${base}/${tab === "history" ? "history" : "members"}?${params}`,
            { cache: "no-store", signal: c.signal },
          ),
        ]);
        const context = await a.json(),
          result = await b.json();
        if (!a.ok || !b.ok) throw new Error(context.error ?? result.error);
        if (!c.signal.aborted) {
          setOverview(context);
          setMembers(result.members ?? []);
          setEntries(result.entries ?? []);
          setTotal(result.total ?? 0);
          setError("");
        }
      } catch (e) {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "조회 실패");
      }
    }
    void load();
    return () => c.abort();
  }, [base, tab, page, search, projectId, revision]);
  async function mutate(member: Member, action: "grant" | "revoke") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`${base}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: member.id,
          action,
          version: member.version,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNotice(
        action === "grant"
          ? "상품 지원을 확정했습니다. 일반 회원의 역할은 user로 유지됩니다."
          : "상품 지원을 회수했습니다.",
      );
      setCandidate(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
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
                      onClick={async () => {
                        const r = await fetch(
                          `${base}/history/${e.source}/${e.id}`,
                        );
                        const d = await r.json();
                        setNotice(
                          r.ok
                            ? JSON.stringify({
                                before: d.beforeJson,
                                after: d.afterJson,
                              })
                            : d.error,
                        );
                      }}
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
              aria-label="회원 검색어"
              placeholder={
                workspaceMode
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
                    const r = await fetch(
                      `${base}/candidates?email=${encodeURIComponent(email)}`,
                    );
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    setCandidate(d.members[0] ?? null);
                    if (!d.members.length)
                      setNotice("지원 가능한 일반 회원이 없습니다.");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "조회 실패");
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
