"use client";
import {usePreferences} from "@/stores/preferences";
import {toast} from "@/stores/toast";
import { useTheme } from "@/stores/theme";
import { Icon } from "./icon";

export function ThemeToggle() {
  const { theme } = useTheme();
  const {saved,save,busy,userId}=usePreferences();
  return (
    <button
      type="button"
      className="theme-toggle"
      role="switch"
      aria-label="다크 모드"
      aria-checked={theme === "dark"}
      title="라이트 / 다크 모드 전환"
      disabled={busy||!userId}
      onClick={() => void save({...saved,defaultTheme:theme === "light" ? "dark" : "light"}).catch(e=>toast(e.message,true))}
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
