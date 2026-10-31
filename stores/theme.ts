"use client";
import { create } from "zustand";
import type { Theme } from "@/lib/theme";
import { personalPalette, personalTokenNames } from "@/lib/personal-palette";
// DB preferences own persistence; preview never writes browser-wide defaults.
export const useTheme = create<{
  theme: Theme;
  accentColor: string | null;
  syncTheme: (theme: Theme, accentColor?: string | null) => void;
  reset: () => void;
}>((set, get) => ({
  theme: "light",
  accentColor: null,
  syncTheme(theme, accentColor = get().accentColor) {
    const palette = personalPalette(theme, accentColor);
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.personalTheme = "true";
    if (accentColor) document.documentElement.dataset.customAccent = "true";
    else delete document.documentElement.dataset.customAccent;
    for (const [name, value] of [["--primary", palette.primary], ["--primary-soft", palette.soft], ["--on-primary", palette.onPrimary]]) document.documentElement.style.setProperty(name, value);
    set({ theme, accentColor });
  },
  reset() {
    document.documentElement.dataset.theme = "light";
    delete document.documentElement.dataset.personalTheme;
    delete document.documentElement.dataset.customAccent;
    for (const name of personalTokenNames) document.documentElement.style.removeProperty(name);
    set({ theme: "light", accentColor: null });
  },
}));
