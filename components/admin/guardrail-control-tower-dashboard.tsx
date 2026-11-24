"use client";
import { useConsoleGuard } from "@/components/shared/console-access";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { usePageVisible } from "@/components/shared/use-page-visible";
import type { GuardrailOverview } from "@/lib/ai/guardrail-control-tower-overview";
import { approvalStageNames } from "@/lib/ai/guardrail-approval-types";
import { guardrailNames } from "@/lib/ai/guardrail-rule-catalog";
import { approvalTime } from "./guardrail-approval-detail";

export function GuardrailRemaining({
  expiresAt,
  status,
}: {
  expiresAt: string;
  status: string;
}) {
  const [instant, setInstant] = useState<number | null>(null);
  const visible = usePageVisible();
  useEffect(() => {
    if (!visible || !["pending", "approved"].includes(status)) return;
    const tick = () => setInstant(Date.now());
    const initial = setTimeout(tick, 0),
      timer = setInterval(tick, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [visible, status]);
  if (instant === null || !["pending", "approved"].includes(status))
    return null;
  const minutes = Math.max(
    0,
    Math.ceil((Date.parse(expiresAt) - instant) / 60000),
  );
  return (
    <span
      className={
        minutes <= 30 ? "tower-remaining is-urgent" : "tower-remaining"
      }
    >
      {minutes === 0
        ? "유효시간 경과 · 서버 확인 필요"
        : `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 남음`}
    </span>
  );
}
const name = (rule: string) =>
  guardrailNames[rule as keyof typeof guardrailNames] ?? rule;
export function GuardrailControlTowerDashboard({
  workspaceId,
  entryProjectId,
  superMode,
  onSelect,
}: {
  workspaceId: string;
  entryProjectId: string;
  superMode: boolean;
  onSelect: (id: string) => void;
}) {
  const visible = usePageVisible();
  const { scope, policy } = useWorkspaceQueryPolicy();
  const endpoint = `/api/${superMode ? "super-admin" : "admin"}/ai-guardrail-control-tower/overview?workspaceId=${encodeURIComponent(workspaceId)}&entryProjectId=${encodeURIComponent(entryProjectId)}`;
  const query = useQuery({
    queryKey: matrixKeys.guardrailOverview(scope, endpoint),
    queryFn: ({ signal }) =>
      requestJson<GuardrailOverview>(endpoint, { signal }),
    ...policy,
    refetchInterval: () => (visible ? 15000 : false),
  });
  useConsoleGuard(query.error);
  if (query.isPending)
    return <p role="status">관제 데이터를 불러오고 있습니다.</p>;
  const data = !query.isError ? query.data : undefined;
  return (
    <div className="tower-dashboard">
      <div className="tower-data-status">
        <span>
          <i aria-hidden="true" />
          관제 데이터 · {data ? approvalTime(data.asOf) : "조회되지 않음"}
        </span>
        <span>15초 갱신 · 검사 통계에 정책 테스트 포함</span>
      </div>
      {query.isError && (
        <p role="alert">
          관제 데이터를 갱신하지 못했습니다. 표시된 값은 마지막 성공 조회
          기준입니다.{" "}
          <button className="button" onClick={() => void query.refetch()}>
            다시 조회
          </button>
        </p>
      )}
      {data && (
        <>
          <div className="tower-metrics">
            {[
              [
                "오늘 검사",
                data.inspectionCounts.total,
                "오늘 KST · 검사 단위",
              ],
              [
                "오늘 차단",
                data.inspectionCounts.blocked,
                "오늘 KST · block 판정",
              ],
              ["승인 대기", data.approvalCounts.pending, "현재 · 미만료 요청"],
              ["만료 임박", data.expiringSoonCount, "현재 · 2시간 이내"],
              [
                "승인 후 재개 대기",
                data.approvalCounts.approved,
                "현재 · 사용자 진행 필요",
              ],
              [
                "재개 실행 중",
                data.approvalCounts.resuming,
                "현재 · 실행 상태",
              ],
            ].map(([label, value, hint]) => (
              <section
                className={`tower-metric${label === "만료 임박" ? " is-warning" : ""}`}
                key={label}
              >
                <h2>{label}</h2>
                <strong>{Number(value).toLocaleString("ko-KR")}</strong>
                <p>{hint}</p>
              </section>
            ))}
          </div>
          <div className="tower-dashboard-main">
            <section className="tower-card">
              <div className="tower-card-heading">
                <h2>최근 검사 이벤트</h2>
                <span>최근 20건</span>
              </div>
              <div className="guardrail-tower-table">
                <table>
                  <thead>
                    <tr>
                      <th>시각 (KST)</th>
                      <th>검사 단계</th>
                      <th>탐지 정책</th>
                      <th>판정</th>
                      <th>연결 요청</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentEvents.map((e) => (
                      <tr key={e.id}>
                        <td>{approvalTime(e.createdAt)}</td>
                        <td>{approvalStageNames[e.stage] ?? e.stage}</td>
                        <td>
                          {e.rules.length
                            ? e.rules.map(name).join(", ")
                            : "탐지 없음"}
                          <small>정책 v{e.policyVersion}</small>
                        </td>
                        <td>
                          <span
                            className={`tower-status decision-${e.decision}`}
                          >
                            {(
                              {
                                allow: "허용",
                                monitor: "모니터링",
                                block: "차단",
                              } as Record<string, string>
                            )[e.decision] ?? e.decision}
                          </span>
                        </td>
                        <td>
                          {e.approvalId ? (
                            <button
                              className="guardrail-request-link"
                              onClick={() => onSelect(e.approvalId!)}
                            >
                              상세 검토
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.recentEvents.length && (
                <p className="tower-empty">검사 이벤트가 없습니다.</p>
              )}
            </section>
            <section className="tower-card">
              <div className="tower-card-heading">
                <h2>만료 임박 승인</h2>
                <span>2시간 이내 · 최대 5건</span>
              </div>
              {data.expiringApprovals.map((a) => (
                <button
                  key={a.id}
                  className="tower-expiring"
                  onClick={() => onSelect(a.id)}
                >
                  <strong>{a.projectName}</strong>
                  <span>
                    {a.userName} · {approvalStageNames[a.stage]}
                  </span>
                  <span>{a.rules.map(name).join(", ")}</span>
                  <GuardrailRemaining
                    expiresAt={a.expiresAt}
                    status="pending"
                  />
                  <small>{approvalTime(a.expiresAt)}</small>
                </button>
              ))}
              {!data.expiringApprovals.length && (
                <p className="tower-empty">
                  만료가 임박한 승인 요청이 없습니다.
                </p>
              )}
            </section>
          </div>
          <div className="tower-dashboard-bottom">
            <section className="tower-card">
              <h2>오늘 차단 정책 분포</h2>
              {data.blockedRules.map((r) => (
                <div className="tower-distribution" key={r.rule}>
                  <span>{name(r.rule)}</span>
                  <meter
                    value={r.count}
                    min={0}
                    max={Math.max(...data.blockedRules.map((x) => x.count), 1)}
                    aria-label={name(r.rule)}
                  />
                  <strong>{r.count}</strong>
                </div>
              ))}
              {!data.blockedRules.length && <p>오늘 차단 이벤트가 없습니다.</p>}
              <p className="tower-note">
                정책별 고유 검사 건수 · 한 검사에서 여러 정책 탐지 시 합계는
                차단 건수보다 클 수 있습니다.
              </p>
            </section>
            <section className="tower-card">
              <h2>오늘 검사 단계 분포</h2>
              {Object.entries(approvalStageNames).map(([key, label]) => (
                <div className="tower-stage" key={key}>
                  <span>{label}</span>
                  <strong>
                    {data.stageCounts.find((s) => s.stage === key)?.count ?? 0}
                  </strong>
                </div>
              ))}
            </section>
            <section className="tower-card">
              <h2>승인 운영 안내</h2>
              <p>
                승인 대기 <strong>{data.approvalCounts.pending}</strong>건
              </p>
              <p>
                승인 후 재개 대기{" "}
                <strong>{data.approvalCounts.approved}</strong>건
              </p>
              <p>
                재개 실행 중 <strong>{data.approvalCounts.resuming}</strong>건
              </p>
              <p className="tower-note">
                관리자 승인만으로 실행되지 않습니다. 요청자가 ‘이어서 진행’을
                눌러야 작업이 실행됩니다.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
