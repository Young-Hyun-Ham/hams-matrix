"use client";
import { useEffect, useState } from "react";
import { ProductAdmin } from "../admin/product-admin";
type Product = {
  id: string;
  name: string;
  plan_code: string;
  status: string;
  version: number;
  used: number;
  member_limit: number | null;
};
type RequestRow = {
  id: string;
  company_name: string;
  applicantName: string;
  contact: string;
  message: string;
  status: string;
  version: number;
};
export function SuperProductConsole({ type }: { type: "business" | "team" }) {
  const [products, setProducts] = useState<Product[]>([]),
    [requests, setRequests] = useState<RequestRow[]>([]),
    [legacy, setLegacy] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState(""),
    [section, setSection] = useState("members"),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const base = `/api/super-admin/${type}/products`;
  useEffect(() => {
    const c = new AbortController();
    async function load() {
      try {
        const r = await fetch(base, { cache: "no-store", signal: c.signal });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) {
          setProducts(d.products);
          setLegacy(d.legacyWorkspaces);
        }
        if (type === "business") {
          const a = await fetch("/api/super-admin/business/requests", {
            cache: "no-store",
            signal: c.signal,
          });
          const b = await a.json();
          if (!a.ok) throw new Error(b.error);
          if (!c.signal.aborted) setRequests(b.requests);
        }
      } catch (e) {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "조회 실패");
      }
    }
    void load();
    return () => c.abort();
  }, [base, type, revision]);
  async function mutate(
    path: string,
    method: string,
    input: Record<string, unknown>,
  ) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (path.startsWith("/api/super-admin/business/requests/"))
        window.dispatchEvent(new Event("business-notifications-refresh"));
      setNotice("처리했습니다.");
      setRevision((n) => n + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리 실패");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const product = products.find((p) => p.id === selected);
  return (
    <section className="admin-product-console admin-settings-stack">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {type === "business" && (
        <>
          <h2>Business 계약 신청</h2>
          {requests.map((r) => (
            <article
              className="panel admin-settings-panel admin-settings-stack"
              key={r.id}
              id={`request-${r.id}`}
            >
              <strong>{r.company_name}</strong>
              <p>
                {r.applicantName} · {r.contact} · {r.status}
              </p>
              <p>{r.message}</p>
              {r.status === "submitted" && (
                <button
                  disabled={busy}
                  className="button"
                  onClick={() =>
                    void mutate(
                      `/api/super-admin/business/requests/${r.id}`,
                      "PATCH",
                      { status: "reviewing", version: r.version },
                    )
                  }
                >
                  검토 시작
                </button>
              )}
              {r.status === "reviewing" && (
                <button
                  disabled={busy}
                  className="button"
                  onClick={() =>
                    void mutate(
                      `/api/super-admin/business/requests/${r.id}`,
                      "PATCH",
                      { status: "contracting", version: r.version },
                    )
                  }
                >
                  계약 진행
                </button>
              )}
              {r.status === "contracting" && (
                <form
                  className="admin-settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void mutate(
                      `/api/super-admin/business/requests/${r.id}`,
                      "PATCH",
                      {
                        status: "approved",
                        version: r.version,
                        productId: f.get("productId"),
                      },
                    );
                  }}
                >
                  <select
                    name="productId"
                    aria-label={`${r.company_name} 연결 상품`}
                    required
                  >
                    <option value="">계약할 업체 상품 선택</option>
                    {products
                      .filter((p) => p.status === "active")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <button className="button primary" disabled={busy}>
                    계약 승인·상품 연결
                  </button>
                </form>
              )}
              {["submitted", "reviewing", "contracting"].includes(r.status) && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void mutate(
                      `/api/super-admin/business/requests/${r.id}`,
                      "PATCH",
                      { status: "rejected", version: r.version },
                    )
                  }
                >
                  신청 반려
                </button>
              )}
            </article>
          ))}
          {!requests.length && <p>계약 신청이 없습니다.</p>}
          <form
            className="panel admin-settings-panel admin-settings-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              if (await mutate(base, "POST", { name: f.get("name") }))
                form.reset();
            }}
          >
            <h2>업체별 Business 상품 생성</h2>
            <label>
              상품명{" "}
              <input
                name="name"
                required
                maxLength={100}
                placeholder="Business · 업체명"
              />
            </label>
            <button className="button primary" disabled={busy}>
              계약 확정 상품 생성
            </button>
          </form>
        </>
      )}
      <h2>{type === "business" ? "업체별 Business" : "결제된 Team"} 상품</h2>
      {type === "team" && (
        <p>
          검증된 Team 결제 구매자만 team_admin이 됩니다. 미결제 관리자 수동
          생성은 제공하지 않습니다.
        </p>
      )}
      <label className="admin-settings-field">
        관리 상품
        <select
          aria-label="관리 상품"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">상품 선택</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.status} · {p.used}/{p.member_limit ?? "무제한"}
            </option>
          ))}
        </select>
      </label>
      {product && (
        <>
          <p className="admin-settings-actions">
            {product.name} · {product.status}{" "}
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void mutate(`${base}/${product.id}`, "PATCH", {
                  status: product.status === "active" ? "suspended" : "active",
                  version: product.version,
                })
              }
            >
              {product.status === "active" ? "상품 일시 중지" : "상품 재개"}
            </button>
          </p>
          {product.status === "active" && (
            <>
              {type === "business" && (
                <form
                  className="panel admin-settings-panel admin-settings-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      f = new FormData(form);
                    if (
                      await mutate(`${base}/${product.id}/admins`, "POST", {
                        name: f.get("name"),
                        email: f.get("email"),
                        password: f.get("password"),
                      })
                    )
                      form.reset();
                  }}
                >
                  <h3>biz_admin 계정 생성</h3>
                  <p>
                    선택한 업체의 신규 관리자 계정을 생성합니다. 기존 이메일
                    계정은 변경하지 않습니다.
                  </p>
                  <label>
                    이름 <input name="name" required maxLength={80} />
                  </label>
                  <label>
                    이메일 <input name="email" type="email" required />
                  </label>
                  <label>
                    초기 비밀번호{" "}
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={10}
                      autoComplete="new-password"
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    biz_admin 생성
                  </button>
                </form>
              )}
              <div className="admin-settings-actions">
                {[
                  ["members", "회원 관리"],
                  ["guardrails", "AI 가드레일"],
                  ["history", "상품 이력"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={`button ${section === key ? "primary" : ""}`}
                    onClick={() => setSection(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ProductAdmin
                key={`${product.id}:${revision}`}
                product={product}
                base={`${base}/${product.id}`}
                tab={section}
                superMode
              />
              {legacy.length > 0 && (
                <form
                  className="panel admin-settings-panel admin-settings-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void mutate(`${base}/${product.id}/mapping`, "POST", {
                      workspaceId: f.get("workspaceId"),
                    });
                  }}
                >
                  <label>
                    기존 미분류 공간 연결{" "}
                    <select name="workspaceId" required>
                      {legacy.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    소유자의 현재 상품 소속과 고정 플랜이 일치하는 공간만 연결할
                    수 있습니다.
                  </p>
                  <button className="button" disabled={busy}>
                    기존 공간 연결
                  </button>
                </form>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
