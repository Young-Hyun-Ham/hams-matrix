// src/store/slices/scenarioSlice.ts
"use client";

import { fetchScenarios } from "../../services/backendService";

import type { DB_TYPE, Scenario } from "../../types/types";

// get -> _get (사용하지 않는 변수 처리)
export const scenarioSlice = (set: any, _get: any) => ({
  // 데이터
  scenarios: [] as Scenario[],
  setScenarios: (data: Scenario[]) => set({ scenarios: data }),
  scenario: {} as Scenario,
  setScenario: (data: Scenario) => set({ scenario: data }),
  loading: false,
  error: undefined,

  // UI 초기값
  isCreating: false,
  createDraft: { name: "", description: "" },
  selectedScenarioId: null as string | null,
  setSelectedScenarioId: (id: string | null) => set({ selectedScenarioId: id }),
  editingScenarioId: null,
  editDraft: { name: "", description: "" },
  openTooltipId: null,

  // 등록 폼
  openCreate() {
    set({ isCreating: true, createDraft: { name: "", description: "" } });
  },
  cancelCreate() {
    set({ isCreating: false, createDraft: { name: "", description: "" } });
  },
  setCreateField(name: string, value: string) {
    set((s: any) => ({ createDraft: { ...s.createDraft, [name]: value } }));
  },

  fetchScenarios: async (backend: DB_TYPE, args: any) => {
    try {
      const data = await fetchScenarios(backend, args);
      set({
        scenarios: data || [],
      });
    } catch (error) {
      console.error("Error fetching scenario:", error);
      alert("Failed to load scenario details.");
      set({ scenarios: [] });
    }
  },

  // 수정 폼
  startEdit(s: any) {
    set({
      editingScenarioId: s.id,
      editDraft: { name: s.name ?? "", description: s.description ?? "" },
    });
  },
  cancelEdit() {
    set({ editingScenarioId: null, editDraft: { name: "", description: "" } });
  },
  setEditField(name: string, value: string) {
    set((state: any) => ({ editDraft: { ...state.editDraft, [name]: value } }));
  },

  // tooltip 토글
  toggleTooltip(id: string) {
    set((s: any) => ({ openTooltipId: s.openTooltipId === id ? null : id }));
  },
});
