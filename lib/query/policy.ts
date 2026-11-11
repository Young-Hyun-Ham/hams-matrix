import type { SystemSettings } from "@/lib/system-settings/types";
import { RequestError } from "./error-messages";
export function createWorkspaceQueryPolicy(settings: SystemSettings) {
  return {
    staleTime: settings.staleTimeMs,
    retry: (failureCount: number, error: unknown) =>
      failureCount < settings.retryCount &&
      error instanceof RequestError &&
      (error.kind === "network" ||
        error.kind === "timeout" ||
        (error.status !== null &&
          [408, 425, 429, 500, 502, 503, 504].includes(error.status))),
    retryDelay: (attempt: number, error: unknown) =>
      Math.max(
        Math.min(1000 * 2 ** attempt, 30000),
        error instanceof RequestError ? (error.retryAfterMs ?? 0) : 0,
      ),
    refetchOnWindowFocus: false as const,
  };
}
