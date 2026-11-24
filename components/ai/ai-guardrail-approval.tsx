"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { requestJson } from "@/lib/query/browser-fetch";
import { matrixKeys } from "@/lib/query/keys";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { usePageVisible } from "@/components/shared/use-page-visible";
import {
  approvalStageNames,
  approvalStatusNames,
  type GuardrailApproval,
} from "@/lib/ai/guardrail-approval-types";

export function useGuardrailApproval(
  convId: string,
  enabled: boolean,
  turnIds: string[] = [],
) {
  const visible = usePageVisible();
  const { scope, policy } = useWorkspaceQueryPolicy(),
    client = useQueryClient();
  const base = `/api/ai/guardrail-approvals?convId=${encodeURIComponent(convId)}`;
  const selection = turnIds
    .slice(-100)
    .map((id) => `&turnId=${encodeURIComponent(id)}`)
    .join("");
  const endpoint = base + selection;
  const key = matrixKeys.guardrailApprovals(scope, base);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      requestJson<{ requests: GuardrailApproval[] }>(endpoint, { signal }),
    ...policy,
    enabled,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    structuralSharing: (previous, next) => {
      const old =
        (previous as { requests: GuardrailApproval[] } | undefined)?.requests ??
        [];
      const incoming = (next as { requests: GuardrailApproval[] }).requests;
      const merged = new Map(old.map((item) => [item.id, item]));
      for (const item of incoming)
        if ((merged.get(item.id)?.version ?? 0) <= item.version)
          merged.set(item.id, item);
      return { requests: [...merged.values()] };
    },
    refetchInterval: (q) =>
      enabled &&
      visible &&
      q.state.data?.requests.some((item) =>
        ["awaiting_choice", "pending", "approved", "resuming"].includes(
          item.status,
        ),
      )
        ? 15000
        : false,
  });
  const scopeUser = scope.userId,
    scopeWorkspace = scope.workspaceId;
  useEffect(() => {
    if (enabled)
      void client.invalidateQueries({
        queryKey: matrixKeys.guardrailApprovals(
          { userId: scopeUser, workspaceId: scopeWorkspace },
          base,
        ),
      });
  }, [selection, enabled, client, scopeUser, scopeWorkspace, base]);
  const requests = query.data?.requests ?? [];
  return {
    ...query,
    requests,
    receive: (value: GuardrailApproval) =>
      client.setQueryData<{ requests: GuardrailApproval[] }>(
        key,
        (current) => ({
          requests: [
            ...(current?.requests ?? []).filter((item) => item.id !== value.id),
            (current?.requests.find((item) => item.id === value.id)?.version ??
              0) > value.version
              ? current!.requests.find((item) => item.id === value.id)!
              : value,
          ],
        }),
      ),
    refresh: () => client.invalidateQueries({ queryKey: key }),
  };
}
export function AiGuardrailApproval({
  approval,
  busy,
  onResume,
  onChanged,
  onStop,
}: {
  approval: GuardrailApproval;
  busy: boolean;
  onResume: () => void;
  onChanged: () => void;
  onStop: () => void;
}) {
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(true);
  const decision = useMutation({
    mutationFn: (action: string) =>
      requestJson<GuardrailApproval>(
        action === "cancel"
          ? `/api/ai/guardrail-approvals/${approval.id}/cancel`
          : `/api/ai/guardrail-challenges/${approval.id}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: action,
            expectedVersion: approval.version,
          }),
        },
      ),
    retry: false,
    onSuccess: () => {
      setError("");
      onChanged();
    },
    onError: () => {
      setError(
        "요청 상태를 확인하지 못했습니다. 최신 상태를 조회한 뒤 다시 시도해 주세요.",
      );
      onChanged();
    },
  });
  const choose = (value: string) => decision.mutate(value),
    disabled = busy || decision.isPending;
  return (
    <section className="matrix-ai-guardrail" aria-label="가드레일 승인 요청">
      <p role="status" aria-live="polite">
        {approvalStatusNames[approval.status]}
      </p>
      {approval.status === "awaiting_choice" && (
        <p>
          [{approval.policies.map((p) => p.displayName).join(", ")}] 가드레일
          정책으로 인해 해당 작업에 대해 관리자에게 승인 요청을 하시겠습니까?
        </p>
      )}
      <details
        open={!collapsed}
        onToggle={(event) => setCollapsed(!event.currentTarget.open)}
      >
        <summary>정책 상세 보기</summary>
        {approval.promptExcerpt && <p>요청한 작업: {approval.promptExcerpt}</p>}
        <ul>
          {approval.policies.map((p) => (
            <li key={p.rule}>
              {p.displayName} ({p.rule})
            </li>
          ))}
        </ul>
        <p>
          {approvalStageNames[approval.stage]} · 적용 정책 v
          {approval.policyVersion}
        </p>
      </details>
      <small>
        요청 ID: {approval.id}
        <br />
        만료:{" "}
        {new Date(approval.expiresAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        })}{" "}
        KST
      </small>
      {approval.comment && <p>관리자 처리 의견: {approval.comment}</p>}
      {["pending", "approved", "resuming"].includes(approval.status) ? (
        <p>
          {approval.status === "pending"
            ? "관리자 승인 요청을 보냈습니다. 관리자 승인 후 진행할 수 있습니다."
            : approval.status === "approved"
              ? "관리자가 승인했습니다. 이어서 진행을 눌러 주세요."
              : "승인된 요청을 이어서 실행하고 있습니다."}
        </p>
      ) : approval.status !== "awaiting_choice" ? (
        <p>
          {approval.status === "completed"
            ? "기존 대화에서 실행 결과와 변경안 검토 상태를 확인해 주세요."
            : "종료된 요청입니다. 필요한 경우 새 요청을 제출해 주세요."}
        </p>
      ) : null}
      <div className="matrix-ai-hitl-actions">
        {approval.status === "awaiting_choice" ? (
          <>
            <button
              type="button"
              className="button"
              disabled={disabled}
              onClick={() => choose("decline")}
            >
              아니요(No)
            </button>
            <button
              type="button"
              className="button"
              disabled={disabled}
              onClick={() => choose("request_approval")}
            >
              예(Yes)
            </button>
          </>
        ) : ["pending", "approved", "resuming"].includes(approval.status) ? (
          <>
            <button
              type="button"
              className="button"
              disabled={!approval.canResume || disabled}
              onClick={onResume}
            >
              이어서 진행
            </button>
            <button
              type="button"
              className="button"
              disabled={
                decision.isPending || (approval.status !== "resuming" && busy)
              }
              onClick={() =>
                approval.status === "resuming" ? onStop() : choose("cancel")
              }
            >
              {approval.status === "resuming" ? "생성 중지" : "취소"}
            </button>
          </>
        ) : null}
        <button type="button" className="button" onClick={onChanged}>
          상태 새로고침
        </button>
        {!["awaiting_choice", "pending", "approved", "resuming"].includes(
          approval.status,
        ) && (
          <button
            type="button"
            className="button"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "상세 보기" : "상세 접기"}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
