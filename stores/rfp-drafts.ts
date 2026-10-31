"use client";
import { create } from "zustand";
import type { RfpDraft, RfpDocument } from "@/lib/rfp-types";

type RfpDraftState = {
  drafts: Record<string, RfpDraft>;
  documents: Record<string, RfpDocument | null>;
  setDocument: (key: string, document: RfpDocument | null) => void;
  put: (key: string, draft: RfpDraft) => void;
  remove: (key: string) => void;
};

// Unsaved edits and their base version survive tab changes. Persistence is explicit.
export const useRfpDrafts = create<RfpDraftState>((set) => ({
  drafts: {},
  documents: {},
  setDocument: (key, document) => set(state => ({documents:{...state.documents,[key]:document}})),
  put: (key, draft) => set((state) => ({ drafts: { ...state.drafts, [key]: draft } })),
  remove: (key) => set((state) => {
    const drafts = { ...state.drafts };
    delete drafts[key];
    return { drafts };
  }),
}));
