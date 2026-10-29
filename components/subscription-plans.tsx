"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@/lib/plan-types";
import { PlansToggle, type BillingPeriod } from "./plans-toggle";
import styles from "./subscription-plans.module.css";
const amount = (v: number | null) =>
  v === null ? "등록 예정" : `${v.toLocaleString("ko-KR")}원`;
const limit = (v: number | null) =>
  v === null ? "무제한" : v.toLocaleString("ko-KR");
export function SubscriptionPlans({
  plans,
  current,
  usage,
  readOnly = false,
}: {
  plans: Plan[];
  current?: Plan;
  usage?: Record<string, number>;
  readOnly?: boolean;
}) {
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null),
    submitting = useRef(false);
  const [selected, setSelected] = useState<Plan | null>(null),
    [period, setPeriod] = useState<BillingPeriod>("month"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function changePlan() {
    if (!selected || !current || readOnly || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/me/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selected.code,
          currentPlan: current.code,
          planVersion: selected.version,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "요금제를 변경하지 못했습니다.");
      dialog.current?.close();
      setNotice(`${selected.name} 요금제로 변경되었습니다.`);
      setSelected(null);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "요금제를 변경하지 못했습니다.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section>
      <div className={styles.heading}>
        <h1>요금제</h1>
        {current && <span className="badge purple">{current.name} 이용 중</span>}
      </div>
      <p>
        ※ 현재 결제 시스템이 연결되어 있지 않습니다. 결재 버튼을 누르면 실제 청구 없이 요금제가 즉시 변경됩니다.
      </p>
      <p className="muted">
        {readOnly ? "게스트는 요금제를 조회만 할 수 있습니다." : ""}
      </p>
      <div style={{ display: "flex", justifyContent: "center", margin: "20px 0" }}>
        <PlansToggle period={period} onChange={setPeriod} />
      </div>
      {notice && <p role="status">{notice}</p>}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 16,
        }}
      >
        {plans.map((plan) => {
          const regularPrice = period === "month" ? plan.monthlyPrice : plan.yearlyPrice;
          const discountPrice = period === "month" ? plan.monthlyDiscountPrice : plan.yearlyDiscountPrice;
          const showDiscount = plan.priceMode === "fixed" && regularPrice !== null && discountPrice !== null;
          const discountRate = showDiscount && regularPrice > 0
            ? Math.round((1 - discountPrice / regularPrice) * 100)
            : null;
          return (
          <article
            key={plan.code}
            className="panel"
            style={{
              padding: 24,
              paddingTop: 9,
              borderColor: plan.recommended ? "var(--primary)" : undefined,
            }}
          >
            <div className={styles.tagRow}>
              {plan.recommended && <span className="badge purple">추천</span>}
              {showDiscount && <span className="badge green">할인</span>}
            </div>
            <div className={styles.nameRow}>
              <h2>{plan.name}</h2>
              {discountRate !== null && <span className={styles.discountRate}>{discountRate}% 할인</span>}
            </div>
            <p className={styles.priceRow}>
              {/* {period === "month" ? "월" : "년"}{" "} */}
              <strong className={`${styles.price} ${showDiscount ? styles.discountPrice : ""}`}>{plan.priceMode === "contact"
                ? "협의"
                : amount(showDiscount ? discountPrice : regularPrice)}</strong>
              {showDiscount && <del className={styles.originalPrice}>{amount(regularPrice)}</del>}
            </p>
            <ul style={{ paddingLeft: 18, lineHeight: 2.2 }}>
              <li>프로젝트 {limit(plan.projectLimit)}개</li>
              <li>
                총 토큰 {limit(plan.tokenLimit)}
                {plan.code === "business" && " · 사용량 과금"}
              </li>
              <li>일일 이미지 {limit(plan.dailyImageLimit)}개</li>
              <li>프롬프트 이미지 {plan.attachmentLimit}개</li>
              <li>이력 {plan.historyEnabled ? "생성" : "미생성"}</li>
            </ul>
            {current?.code === plan.code ? (
              <span className="badge purple">이용 중</span>
            ) : (
              !readOnly && (
                <label style={{ display: "flex", gap: 8 }}>
                  <input
                    type="radio"
                    name="subscription-plan"
                    checked={selected?.code === plan.code}
                    disabled={busy}
                    onChange={() => {
                      setSelected(plan);
                      setNotice("");
                    }}
                  />
                  {plan.name} 선택
                </label>
              )
            )}
          </article>
        );})}
      </div>
      {!readOnly && (
        <button
          className="button primary"
          style={{ marginTop: 20 }}
          disabled={!selected || busy}
          onClick={() => {
            setError("");
            dialog.current?.showModal();
          }}
        >
          요금제변경
        </button>
      )}
      {current && usage && (
        <div
          className="panel"
          style={{ padding: 20, marginTop: 20, lineHeight: 2 }}
        >
          프로젝트 {usage.projects} / {limit(current.projectLimit)} · 토큰{" "}
          {usage.tokens.toLocaleString("ko-KR")} / {limit(current.tokenLimit)} ·
          일일 이미지 {usage.images} / {limit(current.dailyImageLimit)}
        </div>
      )}
      <dialog
        ref={dialog}
        className="workspace-dialog"
        aria-labelledby="subscription-confirm-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div style={{ padding: 24 }}>
          <h2 id="subscription-confirm-title">
            {selected?.name} 요금제로 변경 하시겠습니까?
          </h2>
          <p>실제 결제나 청구 없이 선택한 요금제로 변경됩니다.</p>
          {error && <p role="alert">{error}</p>}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 20,
            }}
          >
            <button
              className="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              취소
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={changePlan}
            >
              {busy ? "변경 중…" : "결재"}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
