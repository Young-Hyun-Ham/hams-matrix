"use client";

import styles from "./plans-toggle.module.css";

export type BillingPeriod = "month" | "year";

export function PlansToggle({ period, onChange }: {
  period: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
}) {
  return (
    <div className={styles.toggle} role="group" aria-label="요금 표시 기간">
      <button type="button" className={styles.option} aria-pressed={period === "month"}
        onClick={() => onChange("month")}>월간</button>
      <button type="button" className={styles.option} aria-pressed={period === "year"}
        onClick={() => onChange("year")}>년간</button>
    </div>
  );
}
