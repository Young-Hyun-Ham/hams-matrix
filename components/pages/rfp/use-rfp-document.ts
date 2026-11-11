"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState } from "react";
import { useProjectPage } from "@/components/shared/project-page-context";
import { useRfpDrafts } from "@/stores/rfp-drafts";
import { useWorkspace } from "@/stores/workspace";
import { createEmptyRfp } from "@/lib/rfp-template";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
import type { TabPermissions } from "@/lib/project-permission-model";
import type { RfpDocument } from "@/lib/rfp-types";
export function useRfpDocument(externalBusy = false) {
  const { user, data, can, verifyPermission, onDirtyChange } = useProjectPage();
  const { scope, policy, settings } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const client = useQueryClient();
  const queryKey = [
    ...matrixKeys.scope(scope),
    "project",
    data.project.id,
    "rfp",
    "document",
  ];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      requestJson<{
        document: RfpDocument | null;
        permissions: TabPermissions;
      }>(`/api/projects/${data.project.id}/rfp`, { signal }),
    ...policy,
  });
  const serverPermissions = query.isError
    ? null
    : (query.data?.permissions ?? null);
  const loaded = query.data !== undefined;
  const command = useMutation({
    mutationFn: ({ method, input }: { method: string; input: object }) =>
      requestJson<{ document: RfpDocument }>(
        `/api/projects/${data.project.id}/rfp`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    retry: false,
  });
  const key = `${user.workspaceId}:${user.id}:${data.project.id}`;
  const local = useRfpDrafts((s) => s.drafts[key]),
    document = useRfpDrafts((s) => s.documents[key]);
  const put = useRfpDrafts((s) => s.put),
    remove = useRfpDrafts((s) => s.remove),
    setDocument = useRfpDrafts((s) => s.setDocument);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [localError, setError] = useWorkspaceErrorState("");
  const [revision, setRevision] = useState(0);
  const aiVersion = useWorkspace((s) => s.aiDataVersion);
  const draft =
    local ??
    document?.draft ??
    createEmptyRfp(data.project.id, data.project.name);
  const dirty =
    !!local &&
    JSON.stringify(local) !==
      JSON.stringify(
        document?.draft ?? createEmptyRfp(data.project.id, data.project.name),
      );
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      onDirtyChange?.(false);
      window.removeEventListener("beforeunload", leave);
    };
  }, [dirty, onDirtyChange]);
  const error =
    localError || resolveWorkspaceError(query.error, settings.errorMessages);
  useEffect(() => {
    if (!query.data) return;
    const result = query.data;
    const timer = window.setTimeout(() => {
      if (dirtyRef.current)
        setMessage(
          "미저장 편집본을 보존했습니다. 서버 변경 여부를 확인하려면 조회를 누르세요.",
        );
      else {
        setDocument(key, result.document);
        remove(key);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [query.data, key, setDocument, remove]);
  useEffect(() => {
    if (!aiVersion && !revision) return;
    void client.invalidateQueries({
      queryKey: [
        ...matrixKeys.scope(scope),
        "project",
        data.project.id,
        "rfp",
        "document",
      ],
    });
  }, [
    client,
    scope,
    data.project.id,
    data.projectRole,
    data.permissionVersion,
    aiVersion,
    revision,
  ]);
  async function save() {
    if (
      busy ||
      externalBusy ||
      !loaded ||
      !can("rfp", document ? "UPDATE" : "CREATE")
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (!(await verifyPermission("rfp", document ? "UPDATE" : "CREATE")))
        throw new Error(
          "현재 프로젝트 권한으로 사업계획서/제안요청서를 저장할 수 없습니다.",
        );
      const result = await command.mutateAsync({
        method: document ? "PATCH" : "POST",
        input: { id: document?.id, expectedVersion: document?.version, draft },
      });
      client.setQueryData(queryKey, {
        ...query.data,
        document: result.document,
      });
      setDocument(key, result.document);
      remove(key);
      setMessage("제안요청서를 DB에 저장했습니다.");
    } catch (e) {
      setError(
        e instanceof RequestError
          ? e
          : e instanceof Error
            ? e.message
            : "저장하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteDocument() {
    if (
      !document ||
      busy ||
      externalBusy ||
      !can("rfp", "DELETE") ||
      !window.confirm("저장된 제안요청서를 삭제할까요? 변경 이력은 보존됩니다.")
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (!(await verifyPermission("rfp", "DELETE")))
        throw new Error("현재 프로젝트 권한으로 삭제할 수 없습니다.");
      await command.mutateAsync({
        method: "DELETE",
        input: { id: document.id, expectedVersion: document.version },
      });
      client.setQueryData(queryKey, { ...query.data, document: null });
      setDocument(key, null);
      remove(key);
      setMessage("제안요청서를 삭제했습니다.");
    } catch (e) {
      setError(
        e instanceof RequestError
          ? e
          : e instanceof Error
            ? e.message
            : "삭제하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  function reload() {
    if (
      busy ||
      externalBusy ||
      (dirty &&
        !window.confirm("미저장 편집본을 버리고 최신 저장본을 조회할까요?"))
    )
      return;
    dirtyRef.current = false;
    remove(key);
    setError("");
    setRevision((v) => v + 1);
  }
  function acceptGenerated(saved: RfpDocument) {
    client.setQueryData(queryKey, { ...query.data, document: saved });
    if (dirtyRef.current) {
      setMessage(
        "AI 저장이 완료되었습니다. 미저장 편집본은 유지했습니다. 조회로 최신 저장본을 확인하세요.",
      );
      return;
    }
    setDocument(key, saved);
    remove(key);
    setMessage("원본 파일로 생성한 제안요청서를 DB 초안으로 저장했습니다.");
  }
  const writable =
    can("rfp", document ? "UPDATE" : "CREATE") &&
    serverPermissions?.[document ? "UPDATE" : "CREATE"] === true;
  return {
    draft,
    document,
    dirty,
    busy: busy || externalBusy,
    loaded,
    message: writable ? message : "",
    error,
    canWrite: loaded && !busy && !externalBusy && writable,
    canDelete: can("rfp", "DELETE") && serverPermissions?.DELETE === true,
    update: (value: typeof draft) => {
      if (loaded && !busy && !externalBusy && writable) put(key, value);
    },
    save,
    deleteDocument,
    reload,
    acceptGenerated,
  };
}
