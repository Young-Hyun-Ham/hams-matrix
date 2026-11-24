import React, { useState } from "react";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { useBuilderStore } from "../store/index";
import styles from "./SlotDisplay.module.css";

// 💡 실제 프로젝트에서는 useBuilderStore의 state 타입을 정의하여
// 💡 'any' 대신 사용해야 합니다 (예: StoreState).
// type StoreState = { slots: any; selectedRow: any }; // 임시 타입 예시

function SlotDisplay() {
  const { t } = useTranslation();
  // TypeScript lint 오류를 해결하기 위해 any 대신 unknown을 사용하거나,
  // 실제 프로젝트의 StoreState 타입을 사용해야 합니다.
  const slots = useBuilderStore((state: unknown) => (state as any).slots);
  const selectedRow = useBuilderStore(
    (state: unknown) => (state as any).selectedRow,
  ); // <<< [추가] selectedRow 가져오기
  const [isCollapsed, setIsCollapsed] = useState(false);

  const hasSlots = Object.keys(slots || {}).length > 0;
  const hasSelectedRow = selectedRow !== null && selectedRow !== undefined; // <<< [추가]

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLHeadingElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); // 기본 스크롤 동작 방지
      toggleCollapse();
    }
  };

  // 💡 any 타입을 줄이고, value의 타입을 더 명확히 지정하는 것이 좋습니다.
  const renderValue = (value: unknown) => {
    // 💡 객체나 배열인 경우 바로 pretty-print 처리합니다.
    if (typeof value === "object" && value !== null) {
      return (
        <pre className={styles.prettyJson}>
          {/* JSON.stringify의 value 타입을 any로 임시 설정 (lint 무시) */}
          {}
          <code>{JSON.stringify(value as any, null, 2)}</code>
        </pre>
      );
    }

    // 💡 문자열인 경우 JSON 파싱을 시도합니다.
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        // 파싱에 성공하면 객체이므로 pretty-print 처리합니다.
        return (
          <pre className={styles.prettyJson}>
            {/* JSON.stringify의 value 타입을 any로 임시 설정 (lint 무시) */}
            {}
            <code>{JSON.stringify(parsed, null, 2)}</code>
          </pre>
        );
      } catch (error) {
        // JSON 문자열이 아니면 일반 텍스트로 표시합니다.
        return <span>{value}</span>;
      }
    }

    // 💡 그 외(숫자, boolean 등)는 문자열로 변환하여 표시합니다.
    return <span>{String(value)}</span>;
  };

  return (
    <div
      className={`${styles.slotDisplayContainer} ${isCollapsed ? styles.collapsed : ""}`}
    >
      <h4 className={styles.title} onClick={toggleCollapse}>
        {t("Current Values")} {/* 제목 수정 */}
        <span className={styles.toggleIcon}>{isCollapsed ? "▶" : "▼"}</span>
      </h4>
      {!isCollapsed &&
        (hasSlots || hasSelectedRow ? (
          <div className={styles.slotList}>
            {Object.entries(slots || {}).map(([key, value]) => (
              <div key={key} className={styles.slotItem}>
                <span className={styles.slotKey}>{key}:</span>
                <div className={styles.slotValue}>{renderValue(value)}</div>
              </div>
            ))}
            {hasSelectedRow && (
              <div
                key="selectedRow"
                className={styles.slotItem}
                style={{ borderTop: "1px dashed #ccc", paddingTop: "8px" }}
              >
                <span className={styles.slotKey} style={{ color: "#e74c3c" }}>
                  {t("selectedRow")}:
                </span>
                <div className={styles.slotValue}>
                  {renderValue(selectedRow)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className={styles.placeholder}>{t("No values set yet")}.</p>
        ))}
    </div>
  );
}

export default SlotDisplay;
