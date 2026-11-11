import type { QueryScope } from "./keys";
import { defaultErrorMessages } from "@/lib/system-settings/defaults";
export class RequestError extends Error {
  payload?: unknown;
  scope?: QueryScope;
  constructor(
    public status: number | null,
    public code?: string,
    public details?: unknown,
    public requestId?: string,
    public kind: "http" | "network" | "timeout" | "cancel" = "http",
    public retryAfterMs?: number,
  ) {
    super(code ?? kind);
  }
}
export function resolveWorkspaceError(
  error: unknown,
  messages = defaultErrorMessages,
) {
  if (
    !error ||
    (error instanceof Error && error.name === "AbortError") ||
    (error instanceof RequestError && error.kind === "cancel")
  )
    return "";
  const key =
    error instanceof RequestError
      ? error.status
        ? String(error.status)
        : error.kind === "network"
          ? "NETWORK_ERROR"
          : error.kind === "timeout"
            ? "TIMEOUT"
            : "UNKNOWN_ERROR"
      : "UNKNOWN_ERROR";
  return (
    messages[key] ??
    defaultErrorMessages[key] ??
    messages.UNKNOWN_ERROR ??
    defaultErrorMessages.UNKNOWN_ERROR
  );
}
