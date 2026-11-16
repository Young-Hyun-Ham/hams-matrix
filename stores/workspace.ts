"use client";
import type { PastedAiImage } from "@/components/ai/use-ai-images";

import { create } from "zustand";
import type { User } from "@/lib/types";
import { mergeConversationTarget } from "@/lib/ai-target-pages";
import {
  emptyAiContext,
  type AiContext,
  type AiConversation,
} from "@/lib/ai-context";
type State = {
  aiProject: { id: string; name: string };
  setAiProject: (project: { id: string; name: string }) => void;
  aiDrafts: Record<string, { prompt: string; images: PastedAiImage[] }>;
  saveAiDraft: (
    id: string,
    draft: { prompt: string; images: PastedAiImage[] },
    owner: string,
  ) => void;
  aiDataVersion: number;
  notifyAiChange: () => void;
  aiOpen: boolean;
  aiMenuOpen: boolean;
  setAiMenuOpen: (open: boolean) => void;
  aiConversation: AiConversation | null;
  selectAiConversation: (conversation: AiConversation) => void;
  updateAiConversation: (conversation: AiConversation) => void;
  removeAiConversation: (convId: string) => void;
  aiConversationVersion: number;
  refreshAiConversations: () => void;
  aiContext: AiContext;
  setAiOpen: (open: boolean) => void;
  setAiContext: (context: AiContext) => void;
  user: User | null;
  sidebarOpen: boolean;
  search: string;
  setUser: (user: User | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearch: (search: string) => void;
};
// Session credentials are only in HttpOnly cookies. Zustand stores presentation state in memory.
export const useWorkspace = create<State>((set) => ({
  aiProject: { id: "", name: "" },
  aiDrafts: {},
  saveAiDraft: (id, draft, owner) =>
    set((state) =>
      owner === `${state.user?.id}:${state.user?.workspaceId}`
        ? { aiDrafts: { ...state.aiDrafts, [id]: draft } }
        : {},
    ),
  setAiProject: (aiProject) =>
    set({ aiProject, aiConversation: null, aiOpen: false }),
  aiDataVersion: 0,
  notifyAiChange: () =>
    set((state) => ({ aiDataVersion: state.aiDataVersion + 1 })),
  aiOpen: false,
  aiMenuOpen: false,
  setAiMenuOpen: (aiMenuOpen) => set({ aiMenuOpen }),
  aiConversation: null,
  aiConversationVersion: 0,
  refreshAiConversations: () =>
    set((state) => ({
      aiConversationVersion: state.aiConversationVersion + 1,
    })),
  selectAiConversation: (aiConversation) =>
    set({ aiConversation, aiOpen: true, sidebarOpen: false }),
  updateAiConversation: (conversation) =>
    set((state) => ({
      ...(state.aiConversation?.convId === conversation.convId
        ? {
            aiConversation: mergeConversationTarget(
              state.aiConversation,
              conversation,
            ),
          }
        : {}),
      aiConversationVersion: state.aiConversationVersion + 1,
    })),
  removeAiConversation: (convId) =>
    set((state) => ({
      ...(state.aiConversation?.convId === convId
        ? { aiConversation: null, aiOpen: false }
        : {}),
      aiConversationVersion: state.aiConversationVersion + 1,
    })),
  aiContext: emptyAiContext,
  setAiOpen: (aiOpen) =>
    set((state) => ({ aiOpen: aiOpen && !!state.aiConversation })),
  setAiContext: (aiContext) =>
    set((state) => ({
      aiContext,
      ...(aiContext.projectId &&
      state.aiConversation?.projectId !== aiContext.projectId
        ? { aiConversation: null, aiOpen: false }
        : {}),
    })),
  user: null,
  sidebarOpen: false,
  search: "",
  setUser: (user) =>
    set((state) =>
      !user ||
      (state.user !== null &&
        (user.id !== state.user.id ||
          user.workspaceId !== state.user.workspaceId))
        ? {
            user,
            aiOpen: false,
            aiMenuOpen: false,
            aiConversation: null,
            aiContext: emptyAiContext,
            aiProject: { id: "", name: "" },
            aiDrafts: {},
          }
        : { user },
    ),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSearch: (search) => set({ search }),
}));
