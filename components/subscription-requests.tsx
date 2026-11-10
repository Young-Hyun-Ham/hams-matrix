"use client";
import { useEffect, useState } from "react";
type RequestRow = {
  id: string;
  company_name: string;
  status: string;
  version: number;
};
export function SubscriptionRequests({ refreshKey }: { refreshKey: string }) {
  const [requests, setRequests] = useState<RequestRow[]>([]),
    [payment, setPayment] = useState(""),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    async function load() {
      try {
        const [a, b] = await Promise.all([
          fetch("/api/me/business-requests", {
            cache: "no-store",
            signal: c.signal,
          }),
          fetch("/api/me/payments/team/orders", {
            cache: "no-store",
            signal: c.signal,
          }),
        ]);
        const x = await a.json(),
          y = await b.json();
        if (!a.ok || !b.ok) throw new Error(x.error ?? y.error);
        if (!c.signal.aborted) {
          setRequests(x.requests);
          setPayment(y.message);
          setError("");
        }
      } catch (e) {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "신청 상태 조회 실패");
      }
    }
    void load();
    return () => c.abort();
  }, [refreshKey, revision]);
  return (
    <div>
      {payment && <p role="status">{payment}</p>}
      {error && <p role="alert">{error}</p>}
      {requests.length > 0 && (
        <details>
          <summary>내 Business 계약 신청</summary>
          {requests.map((r) => (
            <p key={r.id}>
              {r.company_name} · {r.status}
              {["submitted", "reviewing", "contracting"].includes(r.status) && (
                <button
                  className="button"
                  onClick={async () => {
                    try {
                      const response = await fetch(
                        "/api/me/business-requests",
                        {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            id: r.id,
                            version: r.version,
                          }),
                        },
                      );
                      const d = await response.json();
                      if (!response.ok) throw new Error(d.error);
                      setRevision((n) => n + 1);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "철회 실패");
                    }
                  }}
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
