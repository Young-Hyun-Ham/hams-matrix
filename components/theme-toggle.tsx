"use client";
import { useEffect } from "react";
import { useTheme } from "@/stores/theme";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { Icon } from "./icon";

export function ThemeToggle() {
  const { theme, setTheme, syncTheme } = useTheme();
  useEffect(() => {
    syncTheme(
      document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    );
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null)
        syncTheme(event.newValue === "dark" ? "dark" : "light");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [syncTheme]);
  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-label="다크 모드"
      aria-checked={theme === "dark"}
      title="라이트 / 다크 모드 전환"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
    >
      <span className="theme-sun">
        <Icon name="sun" size={16} />
      </span>
      <span className="theme-moon">
        <Icon name="moon" size={16} />
      </span>
    </button>
  );
}
