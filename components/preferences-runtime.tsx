"use client";
import { useLayoutEffect } from "react";
import { usePreferences, type Preferences } from "@/stores/preferences";
import { useToasts } from "@/stores/toast";
export function PreferencesRuntime({
  userId,
  initial,
}: {
  userId: string;
  initial: Preferences;
}) {
  const { position, current, initialize } = usePreferences();
  const { items, remove } = useToasts();
  useLayoutEffect(() => {
    initialize(userId, initial);
  }, [userId, initial, initialize]);
  return (
    <div
      style={{
        position: "fixed",
        zIndex: 10000,
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(90vw,440px)",
        display: "grid",
        gap: 8,
        ...(position === "top"
          ? { top: 80 }
          : { bottom: "calc(24px + env(safe-area-inset-bottom))" }),
      }}
    >
      {items.map((item) => (
        <div
          className="panel"
          style={{
            padding: 16,
            boxShadow: "0 4px 24px #0003",
            backgroundColor: current.toastBackgroundColor,
            color: current.toastFontColor,
          }}
          role={item.error ? "alert" : "status"}
          key={item.id}
        >
          {item.text}
          <button
            aria-label="알림 닫기"
            onClick={() => remove(item.id)}
            style={{ float: "right", color: "inherit" }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
