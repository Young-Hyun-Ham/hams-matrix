import type { QueryClient } from "@tanstack/react-query";
import { matrixKeys, type QueryScope } from "./keys";
const owners = new WeakMap<QueryClient, Map<string, Set<symbol>>>();
// A route-group transition or React's development remount may replace a Runtime
// with another Runtime for the same identity. Retire caches only after every
// owner has left, so a remount cannot orphan active Query observers.
export function acquireQueryScope(client: QueryClient, scope: QueryScope) {
  let scopes = owners.get(client);
  if (!scopes) {
    scopes = new Map();
    owners.set(client, scopes);
  }
  const key = JSON.stringify([scope.userId, scope.workspaceId]);
  let active = scopes.get(key);
  if (!active) {
    active = new Set();
    scopes.set(key, active);
  }
  const owner = Symbol("query-runtime");
  active.add(owner);
  const group = active;
  return () => {
    group.delete(owner);
    queueMicrotask(() => {
      if (group.size) return;
      void (async () => {
        try {
          await client.cancelQueries({ queryKey: matrixKeys.scope(scope) });
        } catch {
          /* The client may already have been cleared on logout. */
        }
        if (group.size) return;
        client.removeQueries({ queryKey: matrixKeys.scope(scope) });
        if (scopes.get(key) === group) scopes.delete(key);
      })();
    });
  };
}
