"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "@/stores/toast";
import { useRouter } from "next/navigation";
import type { Plan } from "@/lib/plan-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
type Row = {
  id: string;
  name?: string;
  email?: string;
  accountRole?: string;
  plan?: string;
  planName?: string;
  createdAt?: string;
  version?: number;
  source?: string;
  occurredAt?: string;
  actorName?: string;
  workspaceId?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  outcome?: string;
  jobTitle?: string;
  updatedAt?: string;
};
const kst = (value?: string) =>
  value
    ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : "—";
export function AdminList({ kind }: { kind: "members" | "history" }) {
  const router = useRouter();
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({ q: "" }),
    [query, setQuery] = useState<Record<string, string>>({ q: "" }),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(20),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null),
    [localDetailError, setDetailError] = useWorkspaceErrorState(""),
    [saving, setSaving] = useState(false);
  const params = new URLSearchParams({
    ...query,
    page: String(page),
    pageSize: String(pageSize),
  });
  const listing = useQuery({
    queryKey: [
      ...matrixKeys.scope(scope),
      "admin",
      kind,
      { filters: query, page, pageSize },
    ],
    queryFn: ({ signal }) =>
      requestJson<{
        members?: Row[];
        entries?: Row[];
        plans?: Pick<Plan, "code" | "name">[];
        total: number;
        page: number;
      }>(`/api/admin/${kind}?${params}`, { signal }),
    ...policy,
  });
  const result = listing.data
    ? {
        rows: listing.data.members ?? listing.data.entries ?? [],
        total: listing.data.total,
        page: listing.data.page,
      }
    : null;
  const plans = listing.data?.plans ?? [],
    loading = listing.isLoading,
    error = resolveWorkspaceError(listing.error, settings.errorMessages);
  const detailQuery = useQuery({
    queryKey: [
      ...matrixKeys.scope(scope),
      "admin",
      kind,
      "detail",
      selected?.source ?? "",
      selected?.id ?? "",
    ],
    queryFn: ({ signal }) =>
      requestJson<{
        member?: Row;
        canEditRole?: boolean;
        [key: string]: unknown;
      }>(
        kind === "members"
          ? `/api/admin/members/${encodeURIComponent(selected!.id)}`
          : `/api/admin/history/${selected!.source}/${encodeURIComponent(selected!.id)}`,
        { signal },
      ),
    ...policy,
    enabled: Boolean(selected),
  });
  const detail = detailQuery.data,
    detailError =
      localDetailError ||
      resolveWorkspaceError(detailQuery.error, settings.errorMessages);
  const command = useMutation({
    mutationFn: (input: object) =>
      requestJson("/api/admin/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    retry: false,
  });
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (revision)
      void client.invalidateQueries({
        queryKey: [...matrixKeys.scope(scope), "admin", kind],
      });
  }, [client, scope, kind, revision]);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
  }, [selected]);
  function open(row: Row) {
    trigger.current = document.activeElement as HTMLElement;
    setDetailError("");
    setSelected(row);
  }
  function close() {
    dialog.current?.close();
    setSelected(null);
    trigger.current?.focus();
  }
  function reload() {
    setRevision((n) => n + 1);
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail?.member) return;
    const form = new FormData(e.currentTarget),
      member = detail.member;
    if (
      form.get("plan") === member.plan &&
      (!detail.canEditRole || form.get("accountRole") === member.accountRole)
    ) {
      toast("변경된 내용이 없습니다.");
      return;
    }
    setSaving(true);
    setDetailError("");
    try {
      await command.mutateAsync({
        userId: member.id,
        version: member.version,
        ...(form.get("plan") !== member.plan ? { plan: form.get("plan") } : {}),
        ...(detail.canEditRole && form.get("accountRole") !== member.accountRole
          ? { accountRole: form.get("accountRole") }
          : {}),
      });
      toast("회원 설정을 저장했습니다. 사용량은 유지됩니다.");
      router.refresh();
      setSelected({ ...member });
      reload();
    } catch (e) {
      setDetailError(e);
    } finally {
      setSaving(false);
    }
  }
  const member = detail?.member;
  return (
    <section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery({ ...filters });
        }}
        className="admin-list-filters"
      >
        <input
          aria-label="검색어"
          placeholder={
            kind === "members"
              ? "이름·이메일·회원 ID"
              : "행위자·자원·요청 ID·경로"
          }
          maxLength={100}
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        {(kind === "members"
          ? [
              ["role", "계정 역할", ["master", "admin", "user", "guest"]],
              ["plan", "플랜", plans.map((plan) => plan.code)],
            ]
          : [
              ["source", "출처", ["audit", "plan", "logging"]],
              ["outcome", "결과", ["success", "failure"]],
            ]
        ).map(([key, label, options]) => (
          <select
            aria-label={String(label)}
            key={String(key)}
            value={filters[String(key)] ?? ""}
            onChange={(e) =>
              setFilters({ ...filters, [String(key)]: e.target.value })
            }
          >
            <option value="">{label} 전체</option>
            {(options as string[]).map((value) => (
              <option key={value} value={value}>
                {key === "plan"
                  ? (plans.find((plan) => plan.code === value)?.name ?? value)
                  : value}
              </option>
            ))}
          </select>
        ))}
        {kind === "history" && (
          <>
            {["from", "to"].map((key) => (
              <label key={key}>
                {key === "from" ? "시작일" : "종료일"} (KST)
                <input
                  type="date"
                  value={filters[key] ?? ""}
                  onChange={(e) =>
                    setFilters({ ...filters, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            {[
              ["action", "작업 유형"],
              ["actorId", "행위자 ID"],
              ["workspaceId", "워크스페이스 ID"],
              ["resource", "자원 유형"],
            ].map(([key, label]) => (
              <input
                key={key}
                aria-label={label}
                placeholder={label}
                value={filters[key] ?? ""}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              />
            ))}
          </>
        )}
        <button className="button primary">검색</button>
        <button
          className="button"
          type="button"
          onClick={() => {
            setFilters({ q: "" });
            setQuery({ q: "" });
            setPage(1);
          }}
        >
          초기화
        </button>
        <button type="button" className="button" onClick={reload}>
          새로고침
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">조회 중…</p>
      ) : (
        !error &&
        result && (
          <>
            <p>전체 {result.total}건 · 가입일/시각 내림차순 · KST</p>
            <div className="admin-table-scroll">
              <table className="admin-list-table">
                <thead>
                  <tr>
                    {(kind === "members"
                      ? [
                          "이름",
                          "이메일",
                          "계정 역할",
                          "플랜",
                          "가입일",
                          "상세",
                        ]
                      : [
                          "시각",
                          "출처",
                          "행위자",
                          "워크스페이스",
                          "작업·자원",
                          "결과",
                          "상세",
                        ]
                    ).map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr
                      key={`${row.source ?? "member"}:${row.id}`}
                      onDoubleClick={() => open(row)}
                    >
                      {kind === "members" ? (
                        <>
                          <td>{row.name}</td>
                          <td>{row.email ?? "소셜 계정"}</td>
                          <td>{row.accountRole}</td>
                          <td>
                            {row.planName ?? row.plan ?? "구독 정보 없음"}
                          </td>
                          <td>{kst(row.createdAt)}</td>
                        </>
                      ) : (
                        <>
                          <td>{kst(row.occurredAt)}</td>
                          <td>{row.source}</td>
                          <td>{row.actorName}</td>
                          <td>{row.workspaceId ?? "—"}</td>
                          <td>
                            {row.action} · {row.resource} · {row.resourceId}
                          </td>
                          <td>{row.outcome}</td>
                        </>
                      )}
                      <td>
                        <button
                          className="button small"
                          onClick={() => open(row)}
                        >
                          상세 보기
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length === 0 && <p>검색 결과가 없습니다.</p>}
            </div>
            <div className="admin-list-pagination">
              <button
                className="button"
                disabled={result.page <= 1}
                onClick={() => {
                  setPage(result.page - 1);
                }}
              >
                이전
              </button>
              <span>
                {result.page} /{" "}
                {Math.max(1, Math.ceil(result.total / pageSize))}
              </span>
              <button
                className="button"
                disabled={result.page * pageSize >= result.total}
                onClick={() => {
                  setPage(result.page + 1);
                }}
              >
                다음
              </button>
              <select
                aria-label="페이지 크기"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
            </div>
          </>
        )
      )}
      <dialog
        ref={dialog}
        className="workspace-dialog admin-detail-dialog"
        aria-labelledby="admin-detail-title"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
      >
        <div className="dialog-header admin-detail-header">
          <h2 id="admin-detail-title">
            {kind === "members" ? "회원 상세" : "이력 상세"}
          </h2>
          <button className="button admin-detail-close" onClick={close}>
            닫기
          </button>
        </div>
        <div className="admin-detail-body">
          {detailError && (
            <p role="alert">
              {detailError}
              <button
                onClick={() => {
                  setDetailError("");
                  setSelected(selected ? { ...selected } : null);
                }}
              >
                다시 조회
              </button>
            </p>
          )}
          {!detail ? (
            <p role="status">상세 조회 중…</p>
          ) : member ? (
            <>
              <h3>기본 정보</h3>
              <p>ID: {member.id}</p>
              <p>
                {member.name} · {member.email ?? "소셜 계정"}
              </p>
              <p>직무: {member.jobTitle || "미등록"}</p>
              <p>
                가입: {kst(member.createdAt)} · 수정: {kst(member.updatedAt)}
              </p>
              <form className="admin-member-form" onSubmit={save}>
                <fieldset disabled={saving}>
                  <legend>회원 플랜·역할</legend>
                  <label>
                    플랜
                    <select
                      name="plan"
                      defaultValue={member.plan ?? ""}
                      required
                    >
                      <option value="" disabled>
                        구독 정보 없음
                      </option>
                      {plans.map((plan) => (
                        <option key={plan.code} value={plan.code}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    계정 역할{" "}
                    {detail.canEditRole ? (
                      <select
                        name="accountRole"
                        defaultValue={member.accountRole}
                      >
                        {["admin", "user", "guest"].map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    ) : (
                      <strong>{member.accountRole} (읽기 전용)</strong>
                    )}
                  </label>
                  <button className="button primary" disabled={!member.plan}>
                    저장
                  </button>
                </fieldset>
              </form>
            </>
          ) : (
            <pre className="admin-history-json">
              {JSON.stringify(detail, null, 2)}
            </pre>
          )}
        </div>
      </dialog>
    </section>
  );
}
export function LoggingSettings() {
  type LoggingSetting = {
    value: boolean;
    version: number;
    updatedBy: string;
    updatedAt: string;
    description: string;
  };
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const queryKey = [...matrixKeys.scope(scope), "admin", "logging"];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      requestJson<LoggingSetting>("/api/admin/settings/logging", { signal }),
    ...policy,
  });
  const value = query.data;
  const [localError, setError] = useWorkspaceErrorState(""),
    [busy, setBusy] = useState(false);
  const error =
    localError || resolveWorkspaceError(query.error, settings.errorMessages);
  const command = useMutation({
    mutationFn: (input: object) =>
      requestJson<LoggingSetting>("/api/admin/settings/logging", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    retry: false,
  });
  async function save() {
    if (!value) return;
    setBusy(true);
    setError("");
    try {
      const d = await command.mutateAsync({
        value: !value.value,
        version: value.version,
      });
      client.setQueryData(queryKey, d);
      toast("DB 감사 로깅 설정을 저장했습니다.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel admin-logging-settings">
      <h2>DB_LOGGING_ENABLED</h2>
      <p>
        DB 감사 로그 수집만 제어합니다. 플랜·회원 변경과 로깅 설정 변경 기록은
        계속 보존됩니다.
      </p>
      {value && (
        <>
          <p>
            {value.value
              ? "true · DB 감사 기록 생성"
              : "false · DB 감사 기록 생성 중단"}{" "}
            · 수정자 {value.updatedBy ?? "—"} · {kst(value.updatedAt)}
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void save()}
          >
            {value.value ? "로깅 끄기" : "로깅 켜기"}
          </button>
        </>
      )}
      {error && (
        <p role="alert">
          {error} <button onClick={() => location.reload()}>최신값 조회</button>
        </p>
      )}
    </section>
  );
}
