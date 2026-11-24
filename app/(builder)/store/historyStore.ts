// app/(siderbar-header)/admin/builder/store/historyStore.ts
import { create } from "zustand";

import type { Edge, Node } from "reactflow";

export type GraphSnapshot = {
  nodes: Node<any>[];
  edges: Edge<any>[];
  selectedNodeId: string | null;
  startNodeId: string | null;
};

type HistoryState = {
  past: GraphSnapshot[];
  future: GraphSnapshot[];
  push: (snapshot: GraphSnapshot) => void;
  undoSnapshot: (current: GraphSnapshot) => GraphSnapshot | null;
  redoSnapshot: (current: GraphSnapshot) => GraphSnapshot | null;
  clear: () => void;
};

const cloneSnapshot = (snapshot: GraphSnapshot): GraphSnapshot => ({
  nodes: JSON.parse(JSON.stringify(snapshot.nodes)),
  edges: JSON.parse(JSON.stringify(snapshot.edges)),
  selectedNodeId: snapshot.selectedNodeId,
  startNodeId: snapshot.startNodeId,
});

const useBuilderHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],

  push: (snapshot) =>
    set((state) => ({
      past: [...state.past, cloneSnapshot(snapshot)],
      future: [],
    })),

  undoSnapshot: (current) => {
    const { past } = get();
    if (past.length === 0) return null;

    const previous = past[past.length - 1];

    set((state) => ({
      past: state.past.slice(0, -1),
      future: [cloneSnapshot(current), ...state.future],
    }));

    return cloneSnapshot(previous);
  },

  redoSnapshot: (current) => {
    const { future } = get();
    if (future.length === 0) return null;

    const next = future[0];

    set((state) => ({
      past: [...state.past, cloneSnapshot(current)],
      future: state.future.slice(1),
    }));

    return cloneSnapshot(next);
  },

  clear: () => set({ past: [], future: [] }),
}));

export default useBuilderHistoryStore;
