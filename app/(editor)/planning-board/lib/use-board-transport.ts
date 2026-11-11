"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useSearchParams } from "next/navigation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
import type { jsonRequest } from "@/lib/client-request";
import { boardFetch, syncBoardCursor } from "./client-api";
type LegacyJson = Awaited<ReturnType<typeof jsonRequest>>;
export function planningResource(input: string) {
  if (input.startsWith("/api/projects?")) return "board";
  if (input === "/api/projects") return "documents";
  return input.replace(/^\/api\/projects\/[^/]+/, "");
}
// Compatibility adapter: Query owns JSON server DTOs; existing editor state remains
// the accepted editing snapshot. In particular board reads never refetch in the
// background, since advancing its version cursor without accepting a snapshot
// would bypass conflict checks.
export function useBoardTransport() {
  const { scope, policy, settings } = useWorkspaceQueryPolicy();
  const parameters = useSearchParams();
  const projectId = parameters.get("projectId") ?? "",
    screenId = parameters.get("screenId") ?? "";
  const client = useQueryClient();
  const snapshot = useRef({ policy, settings });
  useLayoutEffect(() => {
    snapshot.current = { policy, settings };
  }, [policy, settings]);
  const [reads, setReads] = useState<string[]>([]);
  const key = (input: string) => [
    ...matrixKeys.scope(scope),
    "planning",
    projectId,
    screenId,
    planningResource(input),
  ];
  useQueries({
    queries: reads.map((input) => ({
      queryKey: key(input),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        requestJson<LegacyJson>(input, { signal }, boardFetch),
      ...policy,
      enabled: false,
    })),
  });
  const command = useMutation({
    mutationFn: ({ input, init }: { input: string; init?: RequestInit }) =>
      requestJson<LegacyJson>(input, init, boardFetch),
    retry: false,
  });
  const { mutateAsync } = command;
  return useCallback(
    async (input: string, init?: RequestInit): Promise<Response> => {
      const { policy, settings } = snapshot.current;
      const resource = planningResource(input),
        queryKey = [
          ...matrixKeys.scope(scope),
          "planning",
          projectId,
          screenId,
          resource,
        ];
      try {
        let data: LegacyJson;
        if ((init?.method ?? "GET").toUpperCase() === "GET") {
          setReads((current) =>
            current.includes(input) ? current : [...current, input],
          );
          data = await client.query({
            queryKey,
            queryFn: ({ signal }) =>
              requestJson<LegacyJson>(
                input,
                {
                  ...init,
                  signal: init?.signal
                    ? AbortSignal.any([signal, init.signal])
                    : signal,
                },
                boardFetch,
              ),
            ...policy,
          });
          if (resource === "board")
            syncBoardCursor({ projectId, screenId }, data);
        } else {
          data = await mutateAsync({ input, init });
          await client.invalidateQueries({
            queryKey: [
              ...matrixKeys.scope(scope),
              "planning",
              projectId,
              screenId,
            ],
            refetchType: "none",
          });
        }
        return Response.json(data);
      } catch (error) {
        if (error instanceof RequestError && error.status)
          return Response.json(
            {
              ...(error.payload && typeof error.payload === "object"
                ? error.payload
                : {}),
              error: resolveWorkspaceError(error, settings.errorMessages),
              code: error.code,
              details: error.details,
            },
            { status: error.status },
          );
        if (error instanceof RequestError)
          error.message = resolveWorkspaceError(error, settings.errorMessages);
        throw error;
      }
    },
    [client, scope, projectId, screenId, mutateAsync, setReads],
  );
}
