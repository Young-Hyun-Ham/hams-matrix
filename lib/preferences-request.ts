"use client";
import { requestJson } from "@/lib/query/browser-fetch";
import type { Preferences, PreferenceEdits } from "@/stores/preferences";
type Commands = {
  read: () => Promise<Preferences>;
  write: (input: PreferenceEdits & { version: number }) => Promise<Preferences>;
};
const bindings = new Map<symbol, Commands>();
export function bindPreferencesCommands(owner: symbol, commands: Commands) {
  bindings.set(owner, commands);
  return () => {
    if (bindings.get(owner) === commands) bindings.delete(owner);
  };
}
export function readPreferences(owner: symbol | null) {
  return (
    (owner && bindings.get(owner)?.read()) ||
    requestJson<Preferences>("/api/me/preferences")
  );
}
export function writePreferences(
  owner: symbol | null,
  input: PreferenceEdits & { version: number },
) {
  return (
    (owner && bindings.get(owner)?.write(input)) ||
    requestJson<Preferences>("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}
