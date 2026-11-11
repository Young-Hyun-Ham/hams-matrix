"use client";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import { resolveWorkspaceError } from "@/lib/query/error-messages";
type RequestRow = {
  id: string;
  company_name: string;
  status: string;
  version: number;
};
export function SubscriptionRequests({ refreshKey }: { refreshKey: string }) {
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const client = useQueryClient();
  const seenRefresh = useRef(refreshKey);
  const key = [...matrixKeys.scope(scope), "business-requests"];
  const requests = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      requestJson<{ requests: RequestRow[] }>("/api/me/business-requests", {
        signal,
      }),
    ...policy,
  });
  const payments = useQuery({
    queryKey: [...matrixKeys.scope(scope), "team-orders"],
    queryFn: ({ signal }) =>
      requestJson<{ message: string }>("/api/me/payments/team/orders", {
        signal,
      }),
    ...policy,
  });
  const mutation = useMutation({
    mutationFn: (r: RequestRow) =>
      requestJson("/api/me/business-requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, version: r.version }),
      }),
    retry: false,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({
        queryKey: matrixKeys.notifications(scope),
      });
    },
  });
  useEffect(() => {
    if (seenRefresh.current === refreshKey) return;
    seenRefresh.current = refreshKey;
    void client.invalidateQueries({
      queryKey: [...matrixKeys.scope(scope), "business-requests"],
    });
    void client.invalidateQueries({
      queryKey: [...matrixKeys.scope(scope), "team-orders"],
    });
  }, [client, scope, refreshKey]);
  const error = resolveWorkspaceError(
    mutation.error ?? requests.error ?? payments.error,
    settings.errorMessages,
  );
  return (
    <div>
      {payments.data?.message && <p role="status">{payments.data.message}</p>}
      {error && <p role="alert">{error}</p>}
      {Boolean(requests.data?.requests.length) && (
        <details>
          <summary>내 Business 계약 신청</summary>
          {requests.data?.requests.map((r) => (
            <p key={r.id}>
              {r.company_name} · {r.status}
              {["submitted", "reviewing", "contracting"].includes(r.status) && (
                <button
                  className="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(r)}
                >
                  신청 철회
                </button>
              )}
            </p>
          ))}
        </details>
      )}
    </div>
  );
}
