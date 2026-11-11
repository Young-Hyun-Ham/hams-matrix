"use client";
import { useState } from "react";
import { useWorkspaceQueryPolicy } from "./workspace-query-runtime";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
// Retain transport errors as objects so changing workspace wording also updates
// an error that is already on screen. Plain local validation stays plain text.
export function useWorkspaceErrorState(initial: string | (() => string) = "") {
  const [failure, setFailure] = useState<unknown>(initial);
  const { settings, scope } = useWorkspaceQueryPolicy();
  const foreign =
    failure instanceof RequestError &&
    failure.scope &&
    (failure.scope.userId !== scope.userId ||
      failure.scope.workspaceId !== scope.workspaceId);
  const message = foreign
    ? ""
    : typeof failure === "string"
      ? failure
      : resolveWorkspaceError(failure, settings.errorMessages);
  return [message, setFailure] as const;
}
