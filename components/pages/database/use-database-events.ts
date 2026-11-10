"use client";
import { useEffect } from "react";
import type { User } from "@/lib/types";
export function databaseChannel(user: User, projectId: string) {
  return `matrix-database:${user.id}:${user.workspaceId}:${projectId}`;
}
export function notifyDatabaseChange(user: User, projectId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(databaseChannel(user, projectId));
    channel.postMessage({ changed: true });
  } catch {
    // Optional notifications must not turn a successful save into an error.
  } finally {
    channel?.close();
  }
}
export function useDatabaseEvents(
  user: User,
  projectId: string,
  refresh: () => void,
) {
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined")
        channel = new BroadcastChannel(databaseChannel(user, projectId));
    } catch {
      // Focus and manual refresh remain available if channels are blocked.
    }
    if (channel) channel.onmessage = () => refresh();
    const focus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      channel?.close();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [user.id, user.workspaceId, projectId, user, refresh]);
}
