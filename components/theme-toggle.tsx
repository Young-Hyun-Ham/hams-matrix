"use client";
import { usePreferences } from "@/stores/preferences";
import { toast } from "@/stores/toast";
import { useTheme } from "@/stores/theme";
import { Icon } from "./icon";

export function ThemeToggle() {
  const { theme } = useTheme();
  const { saved, current, save, busy, userId } = usePreferences();
  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-label="다크 모드"
      aria-checked={theme === "dark"}
      title={current.defaultTheme !== saved.defaultTheme ? "편집 중인 기본 테마를 먼저 저장하거나 취소해 주세요." : theme === "dark" ? "라이트 모드로 변경" : "다크 모드로 변경"}
      disabled={busy || !userId || current.defaultTheme !== saved.defaultTheme}
      onClick={() =>
        void save({
          version: saved.version,
          defaultTheme: theme === "light" ? "dark" : "light",
        }).catch((e) => toast(e.message, true))
      }
    >
      <Icon name={theme === "dark" ? "moon" : "sun"} size={18} />
    </button>
  );
}
