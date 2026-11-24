import type { QueryClient } from "@tanstack/react-query";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
import { matrixKeys, type QueryScope } from "@/lib/query/keys";
import type { createWorkspaceQueryPolicy } from "@/lib/query/policy";
type Binding = {
  client: QueryClient;
  scope: QueryScope;
  policy: ReturnType<typeof createWorkspaceQueryPolicy>;
  controller: AbortController;
  errorMessages?: Parameters<typeof resolveWorkspaceError>[1];
};
let binding: Binding | undefined;
export function updateBuilderPolicy(
  policy: Binding["policy"],
  errorMessages?: Binding["errorMessages"],
) {
  if (binding) {
    binding.policy = policy;
    binding.errorMessages = errorMessages;
  }
}
export function bindBuilderTransport(next: Binding) {
  // StrictMode may remount immediately after aborting the previous scope. Never
  // deduplicate a fresh initialization against that scope's aborted query promise.
  next.client.removeQueries({ queryKey: matrixKeys.builder(next.scope) });
  binding = next;
  return () => {
    next.controller.abort();
    if (binding === next) binding = undefined;
  };
}
export async function builderRequest<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const active = binding;
  if (!active) throw new Error("빌더 사용자 범위를 불러오는 중입니다.");
  const url = "/api/builder" + path,
    key = matrixKeys.builder(active.scope, path);
  const read = ({ signal }: { signal?: AbortSignal } = {}) =>
    requestJson<T>(url, {
      signal: signal
        ? AbortSignal.any([signal, active.controller.signal])
        : active.controller.signal,
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(data ?? {}),
    });
  let result: T;
  try {
    result =
      method === "GET"
        ? await active.client.query({
            queryKey: key,
            queryFn: read,
            ...active.policy,
          })
        : await read();
  } catch (error) {
    if (error instanceof RequestError)
      error.message = resolveWorkspaceError(error, active.errorMessages);
    throw error;
  }
  if (binding !== active || active.controller.signal.aborted)
    throw new DOMException("이전 사용자 범위 요청입니다.", "AbortError");
  if (method !== "GET")
    await active.client.invalidateQueries({
      queryKey: matrixKeys.builder(active.scope),
    });
  return result;
}
export async function builderList<T = any>(path: string) {
  const items: T[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: T[]; nextCursor: string | null } =
      await builderRequest<{ items: T[]; nextCursor: string | null }>(
        path +
          (path.includes("?") ? "&" : "?") +
          "limit=200" +
          (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
      );
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}
