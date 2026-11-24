"use client";
import { useSyncExternalStore } from "react";
const subscribe = (notify: () => void) => {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};
const snapshot = () => document.visibilityState === "visible";
const serverSnapshot = () => true;
export function usePageVisible() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
