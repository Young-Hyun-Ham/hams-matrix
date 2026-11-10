"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@/lib/plan-types";
import type { User } from "@/lib/types";
import { SubscriptionRequests } from "./subscription-requests";
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
  requiredPlan,
  user,
}: {
  plans: Plan[];
  current?: Plan;
  usage?: Record<string, number>;
  readOnly?: boolean;
  requiredPlan?: string;
  user?: User;
}) {
  const isMaster = user?.accountRole === "master";
  const router = useRouter(),
    dialog = useRef<HTMLDialogElement>(null),
    submitting = useRef(false);
  const [selected, setSelected] = useState<Plan | null>(null),
    [period, setPeriod] = useState<BillingPeriod>("month"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [companyName, setCompanyName] = useState(""),
    [contact, setContact] = useState(""),
    [message, setMessage] = useState("");
  async function changePlan() {
    if (!selected || !current || readOnly || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (!isMaster && selected.code === "business") {
        const response = await fetch("/api/me/business-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyName, contact, message }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        dialog.current?.close();
        setNotice(
          "Business 계약 신청을 접수했습니다. 슈퍼관리자가 확인한 후 계약을 진행합니다. 현재 구독은 유지됩니다.",
        );
        setSelected(null);
        router.refresh();
        return;
      }
      if (!isMaster && selected.code === "team") {
        const response = await fetch("/api/me/payments/team/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            billingCycle: period === "year" ? "yearly" : "monthly",
            ...(user?.accountRole === "team_admin" && user.productId
              ? { productId: user.productId }
              : {}),
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        window.location.assign(result.checkoutUrl);
        return;
      }
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
        {current && (
          <span className="badge purple">{current.name} 이용 중</span>
        )}
      </div>
      <p>
        {isMaster
          ? "승인·결제 없이 선택한 요금제가 즉시 적용됩니다."
          : "Team은 결제 성공 확인 후 Team 관리자 권한이 부여됩니다. Business는 슈퍼관리자에게 계약을 신청합니다. Free·Pro 변경은 현재 실제 청구 없이 적용됩니다."}
      </p>
      {user?.productName && <p role="status">현재 상품: {user.productName}</p>}
      {!readOnly && !isMaster && <SubscriptionRequests refreshKey={notice} />}
      <p className="muted">
        {readOnly ? "게스트는 요금제를 조회만 할 수 있습니다." : ""}
      </p>
      <div
        style={{ display: "flex", justifyContent: "center", margin: "20px 0" }}
      >
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
          const regularPrice =
            period === "month" ? plan.monthlyPrice : plan.yearlyPrice;
          const discountPrice =
            period === "month"
              ? plan.monthlyDiscountPrice
              : plan.yearlyDiscountPrice;
          const showDiscount =
            plan.priceMode === "fixed" &&
            regularPrice !== null &&
            discountPrice !== null;
          const discountRate =
            showDiscount && regularPrice > 0
              ? Math.round((1 - discountPrice / regularPrice) * 100)
              : null;
          return (
            <article
              key={plan.code}
              className={`panel ${styles.planCard}`}
              style={{
                padding: 24,
                paddingTop: 9,
                borderColor: plan.recommended ? "var(--primary)" : undefined,
              }}
            >
              <div className={styles.tagRow}>
                {requiredPlan === plan.code && (
                  <span className="badge purple">워크스페이스 플랜</span>
                )}
                {plan.recommended && <span className="badge purple">추천</span>}
                {showDiscount && <span className="badge green">할인</span>}
              </div>
              <div className={styles.nameRow}>
                <h2>{plan.name}</h2>
                {discountRate !== null && (
                  <span className={styles.discountRate}>
                    {discountRate}% 할인
                  </span>
                )}
              </div>
              <p className={styles.priceRow}>
                {/* {period === "month" ? "월" : "년"}{" "} */}
                <strong
                  className={`${styles.price} ${showDiscount ? styles.discountPrice : ""}`}
                >
                  {plan.priceMode === "contact"
                    ? "협의"
                    : amount(showDiscount ? discountPrice : regularPrice)}
                </strong>
                {showDiscount && (
                  <del className={styles.originalPrice}>
                    {amount(regularPrice)}
                  </del>
                )}
              </p>
              <ul style={{ paddingLeft: 18, lineHeight: 2.2 }}>
                <li>프로젝트 {limit(plan.projectLimit)}개</li>
                {plan.projectInviteLimit !== 0 ? (
                  <li>
                    프로젝트당 팀 초대{" "}
                    {plan.projectInviteLimit === null
                      ? "무제한"
                      : `${limit(plan.projectInviteLimit)}명`}{" "}
                  </li>
                ) : null}
                <li>
                  총 토큰 {limit(plan.tokenLimit)}
                  {plan.code === "business" && " · 사용량 과금"}
                </li>
                <li>일일 이미지 생성 {limit(plan.dailyImageLimit)}개</li>
                <li>AI 이미지첨부 제한 {plan.attachmentLimit}개</li>
                {plan.historyEnabled ? <li>이력 생성</li> : ""}
                {plan.teamSharingEnabled ? <li>팀공유 지원</li> : ""}
              </ul>
              <div className={styles.planAction}>
                {current?.code === plan.code ? (
                  <span className="badge purple">
                    이용 중
                    {!isMaster && plan.code === "team"
                      ? " · 갱신은 아래에서 진행"
                      : ""}
                  </span>
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
              </div>
            </article>
          );
        })}
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
          요금제 선택 진행
        </button>
      )}
      {!readOnly &&
        user?.accountRole === "team_admin" &&
        current?.code === "team" && (
          <button
            className="button"
            style={{ marginLeft: 8 }}
            onClick={() => {
              setSelected(current);
              setError("");
              dialog.current?.showModal();
            }}
          >
            Team 결제 갱신
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
        className="workspace-dialog admin-detail-dialog workspace-form-dialog"
        aria-labelledby="subscription-confirm-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div className="dialog-header admin-detail-header">
          <h2 id="subscription-confirm-title">
            {isMaster
              ? `${selected?.name} 요금제로 변경하시겠습니까?`
              : selected?.code === "business"
                ? "Business 계약 신청"
                : selected?.code === "team"
                  ? "Team 결제"
                  : `${selected?.name} 요금제로 변경하시겠습니까?`}
          </h2>
          <button
            type="button"
            className="button admin-detail-close"
            aria-label="요금제 팝업 닫기"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            닫기
          </button>
        </div>
        <div className="admin-detail-body project-registration-body">
          {isMaster ? (
            <p>
              승인·결제 없이 선택한 요금제가 즉시 적용됩니다. master 권한과 기존
              워크스페이스 플랜은 유지됩니다.
            </p>
          ) : selected?.code === "business" ? (
            <>
              <p>
                신청을 접수하면 슈퍼관리자에게 알립니다. 승인 전에는 구독과
                역할이 바뀌지 않습니다.
              </p>
              <label>
                업체명{" "}
                <input
                  required
                  maxLength={100}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </label>
              <label>
                연락처{" "}
                <input
                  required
                  maxLength={200}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </label>
              <label>
                요청 내용{" "}
                <textarea
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </label>
            </>
          ) : (
            <p>
              {selected?.code === "team"
                ? "결제 서비스에서 성공을 확인한 후 Team 상품과 관리자 권한을 활성화합니다. 결제 미연결 상태에서는 요금제나 역할이 변경되지 않습니다."
                : "현재 Free·Pro 변경은 실제 청구 없이 적용됩니다."}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="project-registration-footer">
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
            {busy
              ? "처리 중…"
              : isMaster
                ? "즉시 변경"
                : selected?.code === "business"
                  ? "계약 신청 제출"
                  : selected?.code === "team"
                    ? "Team 결제 진행"
                    : "변경 확정"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
