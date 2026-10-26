"use client";
import { create } from "zustand";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
export const useTheme = create<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  syncTheme: (theme: Theme) => void;
}>((set) => ({
  theme: "light",
  setTheme(theme) {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* Theme still works when browser storage is disabled. */
    }
    set({ theme });
  },
  syncTheme(theme) {
    applyTheme(theme);
    set({ theme });
  },
}));
