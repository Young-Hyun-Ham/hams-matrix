"use client";
import { create } from "zustand";
import type { ScenarioRunState } from "./types";
// Per-builder preview memory only. Never writes Matrix conversations or browser storage.
const usePreviewStore = create<{
  scenarioRuns: Record<string, ScenarioRunState>;
  systemPrompt: string;
  saveScenarioRun: (id: string, value: ScenarioRunState) => void;
  clearScenarioRun: (id: string) => void;
  clear: () => void;
}>((set) => ({
  scenarioRuns: {},
  systemPrompt: "",
  saveScenarioRun: (id, value) =>
    set((s) => ({ scenarioRuns: { ...s.scenarioRuns, [id]: value } })),
  clearScenarioRun: (id) =>
    set((s) => {
      const next = { ...s.scenarioRuns };
      delete next[id];
      return { scenarioRuns: next };
    }),
  clear: () => set({ scenarioRuns: {} }),
}));
export default usePreviewStore;
