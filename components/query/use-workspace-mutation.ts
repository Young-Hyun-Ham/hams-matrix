"use client";
import { useLayoutEffect, useRef } from "react";
import {
  useMutation as useTanStackMutation,
  type DefaultError,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
import { useWorkspaceQueryPolicy } from "./workspace-query-runtime";
export function useWorkspaceMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TContext = unknown,
>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
  client?: QueryClient,
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { scope, settings } = useWorkspaceQueryPolicy();
  const active = useRef(true);
  const wording = useRef(settings.errorMessages);
  useLayoutEffect(() => {
    wording.current = settings.errorMessages;
  }, [settings.errorMessages]);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, [scope.userId, scope.workspaceId]);
  return useTanStackMutation(
    {
      ...options,
      retry: false,
      meta: { ...options.meta, scope },
      onError(error, variables, result, context) {
        if (error instanceof RequestError) {
          error.scope = scope;
          error.message = resolveWorkspaceError(error, wording.current);
        }
        if (active.current)
          return options.onError?.(error, variables, result, context);
      },
      onSuccess(data, variables, result, context) {
        if (active.current)
          return options.onSuccess?.(data, variables, result, context);
      },
      onSettled(data, error, variables, result, context) {
        if (active.current)
          return options.onSettled?.(data, error, variables, result, context);
      },
    },
    client,
  );
}
