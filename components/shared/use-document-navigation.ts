"use client";
import { useState } from "react";
export type DocumentTarget = {
  type: "artifact" | "snapshot" | "rfp";
  id: string;
};
type NavigationState = {
  scope: string;
  entries: DocumentTarget[];
  cursor: number;
  visible: boolean;
};
export function useDocumentNavigation(scope = "") {
  const empty = (): NavigationState => ({
    scope,
    entries: [],
    cursor: 0,
    visible: false,
  });
  const [stored, setState] = useState<NavigationState>(empty);
  const state = stored.scope === scope ? stored : empty();
  const update = (change: (current: NavigationState) => NavigationState) =>
    setState((previous) =>
      change(previous.scope === scope ? previous : empty()),
    );
  const visit = (target: DocumentTarget) =>
    update((current) => {
      const selected = current.entries[current.cursor];
      if (selected?.id === target.id && selected.type === target.type)
        return { ...current, visible: true };
      return {
        scope,
        entries: [...current.entries.slice(0, current.cursor + 1), target],
        cursor: current.entries.length ? current.cursor + 1 : 0,
        visible: true,
      };
    });
  return {
    target: state.visible ? state.entries[state.cursor] : undefined,
    canBack: state.visible && state.cursor > 0,
    canForward: state.visible && state.cursor < state.entries.length - 1,
    open: visit,
    visit,
    back: () =>
      update((current) =>
        current.visible
          ? { ...current, cursor: Math.max(0, current.cursor - 1) }
          : current,
      ),
    forward: () =>
      update((current) =>
        current.visible
          ? {
              ...current,
              cursor: Math.min(current.entries.length - 1, current.cursor + 1),
            }
          : current,
      ),
    close: () => update((current) => ({ ...current, visible: false })),
  };
}
