"use client";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
import { create } from "zustand";
let next = 0;
export const useToasts = create<{
  items: {
    id: number;
    text: string;
    error: boolean;
    requestError?: RequestError;
  }[];
  remove: (id: number) => void;
}>((set) => ({
  items: [],
  remove: (id) =>
    set((s) => ({ items: s.items.filter((item) => item.id !== id) })),
}));
export function toast(value: string | RequestError, error = false) {
  const text = typeof value === "string" ? value : resolveWorkspaceError(value);
  if (useToasts.getState().items.some((item) => item.text === text)) return;
  const id = ++next;
  useToasts.setState((s) => ({
    items: [
      ...s.items.slice(-2),
      {
        id,
        text,
        error,
        ...(value instanceof RequestError ? { requestError: value } : {}),
      },
    ],
  }));
  setTimeout(() => useToasts.getState().remove(id), error ? 8000 : 4000);
}
