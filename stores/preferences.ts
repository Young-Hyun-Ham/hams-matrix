"use client";
import { create } from "zustand";
import { useTheme } from "./theme";
export type Preferences = {
  toastPosition: "top" | "bottom";
  defaultTheme: "light" | "dark";
  toastBackgroundColor: string;
  toastFontColor: string;
  toastCloseButtonColor: string | null;
  toastCloseButtonBackgroundColor: string | null;
  accentColor: string | null;
  version: number;
};
export const defaults: Preferences = { toastPosition: "bottom", defaultTheme: "light", toastBackgroundColor: "#ffffff", toastFontColor: "#262138", toastCloseButtonColor: null, toastCloseButtonBackgroundColor: null, accentColor: null, version: 0 };
export const preferenceKeys = ["toastPosition", "defaultTheme", "toastBackgroundColor", "toastFontColor", "toastCloseButtonColor", "toastCloseButtonBackgroundColor", "accentColor"] as const;
export type PreferenceEdits = Partial<Omit<Preferences, "version">>;
function mergePreview(saved: Preferences, current: Preferences, next: Preferences, submitted: PreferenceEdits = {}) {
  const preserved: PreferenceEdits = {};
  for (const key of preferenceKeys) if (current[key] !== saved[key] && !(key in submitted)) Object.assign(preserved, { [key]: current[key] });
  return { ...next, ...preserved };
}
function apply(current: Preferences) { useTheme.getState().syncTheme(current.defaultTheme, current.accentColor); }
export const usePreferences = create<{
  userId: string; generation: number; owner: symbol | null;
  saved: Preferences; current: Preferences; position: "top" | "bottom"; busy: boolean;
  initialize: (id: string, p: Preferences, owner?: symbol) => void;
  reset: (id: string, owner: symbol) => boolean;
  preview: (p: Preferences, id?: string) => void;
  restore: (id: string) => void;
  reload: () => Promise<Preferences | null>;
  save: (p: PreferenceEdits & { version: number }) => Promise<Preferences | null>;
}>((set, get) => ({
  userId: "", generation: 0, owner: null, saved: defaults, current: defaults, position: "bottom", busy: false,
  initialize(userId, p, owner) {
    const before = get(), next = { ...defaults, ...p };
    const sameUser = before.userId === userId;
    if (sameUser && before.saved.version >= next.version) {
      if (owner) set({ owner });
      apply(before.current);
      return;
    }
    const current = sameUser ? mergePreview(before.saved, before.current, next) : next;
    set({ userId, owner: owner ?? before.owner, saved: next, current, position: current.toastPosition, busy: false, generation: before.generation + 1 });
    apply(current);
  },
  reset(userId, owner) {
    if (get().userId !== userId || get().owner !== owner) return false;
    set({ userId: "", owner: null, saved: defaults, current: defaults, position: "bottom", busy: false, generation: get().generation + 1 });
    useTheme.getState().reset();
    return true;
  },
  preview(p, id = get().userId) {
    if (!id || id !== get().userId) return;
    const current = { ...defaults, ...p };
    set({ current, position: current.toastPosition }); apply(current);
  },
  restore(id) { if (get().userId === id) get().preview(get().saved, id); },
  async reload() {
    const { userId, generation } = get();
    const response = await fetch("/api/me/preferences", { cache: "no-store" });
    const data = await response.json();
    if (get().userId !== userId || get().generation !== generation) return null;
    if (!response.ok) throw new Error(data.error);
    get().initialize(userId, data);
    return get().saved;
  },
  async save(p) {
    const { userId, generation, saved } = get();
    if (!userId) throw new Error("개인 설정을 다시 불러와 주세요.");
    if (get().busy) throw new Error("설정 저장 중입니다.");
    const ownsRequest = () => get().userId === userId && get().generation === generation;
    set({ busy: true });
    try {
      const response = await fetch("/api/me/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
      const data = await response.json();
      if (!ownsRequest()) return null;
      if (!response.ok) throw new Error(data.error);
      const next: Preferences = { ...defaults, ...data };
      const current = mergePreview(saved, get().current, next, p);
      set({ saved: next, current, position: current.toastPosition }); apply(current);
      try { localStorage.setItem(`matrix-preferences:${userId}`, JSON.stringify(next)); } catch { /* DB is authoritative. */ }
      return next;
    } catch (error) {
      if (!ownsRequest()) return null;
      get().restore(userId);
      throw error;
    } finally { if (ownsRequest()) set({ busy: false }); }
  },
}));
