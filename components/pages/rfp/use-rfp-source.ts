"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectPage } from "@/components/shared/project-page-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { useAiModels } from "@/components/query/use-ai-models";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
import {
  RFP_SOURCE_MAX_BYTES,
  type RfpSource,
  type RfpGeneration,
} from "@/lib/rfp-source-types";
import type { RfpDocument } from "@/lib/rfp-types";
import type { useRfpDocument } from "./use-rfp-document";
import { useWorkspace } from "@/stores/workspace";
type Result = { generation: RfpGeneration; document: RfpDocument | null };
export const sourceError = (error: unknown) =>
  error instanceof Error ? error.message : "요청을 완료하지 못했습니다.";
export function useRfpSource(model: ReturnType<typeof useRfpDocument>) {
  const { user, data, can, verifyPermission } = useProjectPage();
  const base = `/api/projects/${data.project.id}/rfp`,
    storageKey = `rfp-generation:${user.workspaceId}:${user.id}:${data.project.id}`;
  const [modelChoice, setSelectedModel] = useState("");
  const [working, setWorking] = useState(false),
    [requestId, setRequestId] = useState<string | null>(null),
    [stopping, setStopping] = useState(false);
  const [localError, setError] = useWorkspaceErrorState(""),
    [notice, setNotice] = useState("");
  const mounted = useRef(false),
    busyRef = useRef(false),
    posting = useRef(false),
    modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  });
  const { scope, policy, settings } = useWorkspaceQueryPolicy({
    userId: user.id,
    workspaceId: user.workspaceId,
  });
  const client = useQueryClient();
  const sourceKey = [
    ...matrixKeys.scope(scope),
    "project",
    data.project.id,
    "rfp",
    "source",
  ];
  const sourceQuery = useQuery({
    queryKey: sourceKey,
    queryFn: ({ signal }) =>
      requestJson<{ source: RfpSource }>(`${base}/source`, { signal }),
    ...policy,
    refetchInterval: (query) =>
      query.state.data?.source.active && !requestId ? 2000 : false,
  });
  const source = sourceQuery.data?.source ?? null;
  const setSource = (next: RfpSource) =>
    client.setQueryData(sourceKey, { source: next });
  const loading = sourceQuery.isLoading;
  const blocked = working || !!requestId || !!source?.active;
  const refresh = useCallback(async () => {
    const result = await client.query({
      queryKey: [
        ...matrixKeys.scope({ userId: user.id, workspaceId: user.workspaceId }),
        "project",
        data.project.id,
        "rfp",
        "source",
      ],
      queryFn: ({ signal }) =>
        requestJson<{ source: RfpSource }>(`${base}/source`, { signal }),
      staleTime: 0,
      retry: false,
    });
    return result.source;
  }, [client, base, user.id, user.workspaceId, data.project.id]);
  const remember = useCallback(
    (id: string | null) => {
      try {
        if (id) sessionStorage.setItem(storageKey, id);
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* The server also exposes the active request to its owner. */
      }
    },
    [storageKey],
  );
  const status = useCallback(
    async (id: string) =>
      client.query({
        queryKey: [
          ...matrixKeys.scope({
            userId: user.id,
            workspaceId: user.workspaceId,
          }),
          "project",
          data.project.id,
          "rfp",
          "generation",
          id,
        ],
        queryFn: ({ signal }) =>
          requestJson<Result>(`${base}/generate/${id}`, { signal }),
        staleTime: 0,
        retry: false,
      }),
    [client, base, user.id, user.workspaceId, data.project.id],
  );
  const settle = useCallback(
    (result: Result) => {
      if (!mounted.current) return;
      if (
        ["running", "stop_requested", "finalizing"].includes(
          result.generation.status,
        )
      ) {
        setRequestId(result.generation.requestId);
        setStopping(
          result.generation.status === "stop_requested" &&
            result.generation.errorCode !== 502,
        );
        if (result.generation.errorCode === 502) {
          setError(Object.assign(new RequestError(502), { scope }));
          setNotice(
            "AI 서버의 중지가 확인되지 않았습니다. 생성 중지 버튼으로 다시 시도해 주세요.",
          );
        }
        return;
      }
      remember(null);
      setRequestId(null);
      setStopping(false);
      setWorking(false);
      busyRef.current = false;
      if (result.generation.status === "completed") {
        setError("");
        if (result.document) modelRef.current.acceptGenerated(result.document);
        setNotice(
          result.document
            ? "제안요청서를 DB 초안으로 저장했습니다. 내용을 검토해 주세요."
            : "생성이 완료된 뒤 저장본이 변경되었습니다. 조회로 최신 내용을 확인해 주세요.",
        );
        useWorkspace.getState().notifyAiChange();
      } else if (result.generation.status === "cancelled") {
        setError("");
        setNotice("생성을 중지했습니다. 기존 문서는 유지됩니다.");
      } else {
        setNotice("");
        const status = Number(result.generation.errorCode);
        setError(
          Object.assign(
            new RequestError(
              Number.isInteger(status) && status >= 400 && status <= 599
                ? status
                : null,
            ),
            { scope },
          ),
        );
        setNotice(
          "기존 문서는 유지됩니다. 최신 원본을 확인하고 다시 시도해 주세요.",
        );
      }
      void refresh().catch(() => {});
    },
    [remember, refresh, setError, scope],
  );
  const canGenerate =
    can("rfp", model.document ? "UPDATE" : "CREATE") &&
    can("documents", "READ");
  const modelQuery = useAiModels(canGenerate);
  const models = modelQuery.data?.models ?? [];
  const selectedModel = models.includes(modelChoice)
    ? modelChoice
    : (modelQuery.data?.defaultModel ?? "");
  const statusQuery = useQuery({
    queryKey: [
      ...matrixKeys.scope(scope),
      "project",
      data.project.id,
      "rfp",
      "generation",
      requestId ?? "",
    ],
    queryFn: ({ signal }) =>
      requestJson<Result>(`${base}/generate/${requestId}`, { signal }),
    ...policy,
    staleTime: 0,
    enabled: Boolean(requestId),
    refetchInterval: 2000,
  });
  const sourceCommand = useMutation({
    mutationFn: ({ url, init }: { url: string; init: RequestInit }) =>
      requestJson<{ source: RfpSource }>(url, init),
    retry: false,
  });
  const generationCommand = useMutation({
    mutationFn: ({ url, init }: { url: string; init: RequestInit }) =>
      requestJson<Result>(url, init),
    retry: false,
  });
  const describe = useCallback(
    (error: unknown) =>
      error instanceof RequestError
        ? resolveWorkspaceError(error, settings.errorMessages)
        : sourceError(error),
    [settings.errorMessages],
  );
  const error =
    localError ||
    resolveWorkspaceError(
      sourceQuery.error ?? modelQuery.error,
      settings.errorMessages,
    );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, [base]);
  useEffect(() => {
    if (!sourceQuery.data) return;
    let pending = sourceQuery.data.source.requestId;
    try {
      pending = pending || sessionStorage.getItem(storageKey);
    } catch {}
    if (!pending) return;
    const timer = window.setTimeout(() => setRequestId(pending), 0);
    return () => window.clearTimeout(timer);
  }, [sourceQuery.data, storageKey]);
  useEffect(() => {
    if (!requestId || !statusQuery.data) return;
    const result = statusQuery.data;
    const timer = window.setTimeout(() => settle(result), 0);
    return () => window.clearTimeout(timer);
  }, [requestId, statusQuery.data, settle]);
  useEffect(() => {
    if (!requestId || !statusQuery.error) return;
    const failure = statusQuery.error;
    const timer = window.setTimeout(() => {
      if (!mounted.current) return;
      if (failure instanceof RequestError && failure.status === 404) {
        if (posting.current) return;
        remember(null);
        setRequestId(null);
        setWorking(false);
        busyRef.current = false;
      }
      setError(
        describe(failure) +
          (failure instanceof RequestError && failure.status === 404
            ? ""
            : " 상태 조회를 다시 시도합니다."),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestId, statusQuery.error, remember, describe, setError]);
  async function upload(files: File[]) {
    if (!files.length || blocked || busyRef.current || model.busy) return;
    if (files.length !== 1) {
      setError("원본 파일은 한 개만 첨부할 수 있습니다.");
      return;
    }
    const file = files[0];
    if (!file.size || file.size > RFP_SOURCE_MAX_BYTES) {
      setError("원본은 비어 있지 않은 20MB 이하 파일이어야 합니다.");
      return;
    }
    busyRef.current = true;
    setWorking(true);
    setError("");
    setNotice("원본 파일을 검사하고 업로드하는 중입니다.");
    try {
      if (
        !(await verifyPermission("rfp", source?.file ? "UPDATE" : "CREATE")) ||
        !(await verifyPermission("documents", "CREATE"))
      )
        throw new Error("파일 첨부 권한이 없습니다.");
      const query = new URLSearchParams({
        name: file.name,
        expectedSourceVersion: String(source?.version ?? 0),
      });
      const result = await sourceCommand.mutateAsync({
        url: `${base}/source?${query}`,
        init: {
          method: source?.file ? "PUT" : "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        },
      });
      if (mounted.current) {
        setSource(result.source);
        setNotice(
          "원본을 첨부했습니다. 문서함에서도 같은 파일을 확인할 수 있습니다.",
        );
        useWorkspace.getState().notifyAiChange();
      }
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof RequestError ? error : describe(error));
        setNotice("");
        void refresh().catch(() => {});
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  async function detach() {
    if (!source || busyRef.current) return;
    busyRef.current = true;
    setWorking(true);
    setError("");
    try {
      const result = await sourceCommand.mutateAsync({
        url: `${base}/source`,
        init: {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedSourceVersion: source.version }),
        },
      });
      if (mounted.current) {
        setSource(result.source);
        setNotice("첨부 연결을 해제했습니다. 원본은 문서함에 보존됩니다.");
        useWorkspace.getState().notifyAiChange();
      }
    } catch (error) {
      if (mounted.current)
        setError(error instanceof RequestError ? error : describe(error));
    } finally {
      busyRef.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  async function generate(prompt = "") {
    if (!source?.file || busyRef.current || model.dirty) return;
    busyRef.current = true;
    posting.current = true;
    setWorking(true);
    setError("");
    setNotice("원본으로 제안요청서를 생성하는 중입니다.");
    const id = crypto.randomUUID();
    remember(id);
    setRequestId(id);
    try {
      settle(
        await generationCommand.mutateAsync({
          url: `${base}/generate`,
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: id,
              sourceFileId: source.file.id,
              expectedSourceVersion: source.version,
              model: selectedModel,
              documentId: model.document?.id ?? null,
              expectedVersion: model.document?.version ?? null,
              prompt: prompt.trim(),
            }),
          },
        }),
      );
    } catch (error) {
      if (!mounted.current) return;
      try {
        settle(await status(id));
        setError(error instanceof RequestError ? error : describe(error));
      } catch (recovery) {
        setError(error instanceof RequestError ? error : describe(error));
        if ((recovery as { status?: number }).status === 404) {
          setWorking(false);
          setRequestId(null);
          busyRef.current = false;
          remember(null);
          void refresh().catch(() => {});
        }
      }
    } finally {
      posting.current = false;
    }
  }
  async function stop() {
    if (!requestId) return;
    setStopping(true);
    setError("");
    try {
      settle(
        await generationCommand.mutateAsync({
          url: `${base}/generate/${requestId}/stop`,
          init: {
            method: "POST",
          },
        }),
      );
    } catch (error) {
      setError(error instanceof RequestError ? error : describe(error));
      setStopping(false);
    }
  }
  return {
    source,
    models,
    selectedModel,
    setSelectedModel,
    loading,
    working,
    requestId,
    stopping,
    error,
    notice,
    blocked,
    canGenerate,
    setError,
    refresh,
    upload,
    detach,
    generate,
    stop,
  };
}
