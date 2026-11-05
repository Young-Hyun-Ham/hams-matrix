"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectPage } from "@/components/shared/project-page-context";
import { jsonRequest } from "@/lib/client-request";
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
  const [source, setSource] = useState<RfpSource | null>(null),
    [models, setModels] = useState<string[]>([]),
    [selectedModel, setSelectedModel] = useState("");
  const [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [requestId, setRequestId] = useState<string | null>(null),
    [stopping, setStopping] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const mounted = useRef(false),
    busyRef = useRef(false),
    posting = useRef(false),
    modelRef = useRef(model);
  useEffect(() => {
    modelRef.current = model;
  });
  const blocked = working || !!requestId || !!source?.active;
  const refresh = useCallback(async () => {
    const result = await jsonRequest(`${base}/source`);
    if (mounted.current) setSource(result.source);
    return result.source as RfpSource;
  }, [base]);
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
    async (id: string): Promise<Result> => {
      const response = await fetch(`${base}/generate/${id}`, {
          cache: "no-store",
        }),
        result = await response.json();
      if (!response.ok)
        throw Object.assign(new Error(result.error ?? "생성 상태 조회 실패"), {
          status: response.status,
        });
      return result;
    },
    [base],
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
        if (result.generation.errorCode === 502)
          setError(
            "AI 서버의 중지가 확인되지 않았습니다. 생성 중지 버튼으로 다시 시도해 주세요.",
          );
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
        setError(
          `생성하지 못했습니다${result.generation.errorCode ? ` (${result.generation.errorCode})` : ""}. 기존 문서는 유지됩니다. 최신 원본을 확인하고 다시 시도해 주세요.`,
        );
      }
      void refresh().catch(() => {});
    },
    [remember, refresh],
  );
  const canGenerate =
    can("rfp", model.document ? "UPDATE" : "CREATE") &&
    can("documents", "READ");
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void jsonRequest(`${base}/source`, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setSource(result.source);
        let pending = result.source.requestId;
        try {
          pending = pending || sessionStorage.getItem(storageKey);
        } catch {}
        if (pending) setRequestId(pending);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(sourceError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    if (canGenerate)
      void jsonRequest("/api/ai/models", { signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) {
            setModels(result.models);
            setSelectedModel(result.defaultModel);
          }
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(sourceError(error));
        });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [base, storageKey, canGenerate, data.permissionVersion]);
  useEffect(() => {
    if (!requestId) return;
    let disposed = false;
    const poll = async () => {
      try {
        const result = await status(requestId);
        if (!disposed) settle(result);
      } catch (error) {
        if (disposed) return;
        if ((error as { status?: number }).status === 404) {
          if (posting.current) return;
          remember(null);
          setRequestId(null);
          setWorking(false);
          busyRef.current = false;
        }
        setError(
          `${sourceError(error)}${(error as { status?: number }).status === 404 ? "" : " 상태 조회를 다시 시도합니다."}`,
        );
      }
    };
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [requestId, status, settle, remember]);
  useEffect(() => {
    if (!source?.active || requestId) return;
    const timer = window.setInterval(
      () => void refresh().catch(() => {}),
      2000,
    );
    return () => window.clearInterval(timer);
  }, [source?.active, requestId, refresh]);
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
      const result = await jsonRequest(`${base}/source?${query}`, {
        method: source?.file ? "PUT" : "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
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
        setError(sourceError(error));
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
      const result = await jsonRequest(`${base}/source`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedSourceVersion: source.version }),
      });
      if (mounted.current) {
        setSource(result.source);
        setNotice("첨부 연결을 해제했습니다. 원본은 문서함에 보존됩니다.");
        useWorkspace.getState().notifyAiChange();
      }
    } catch (error) {
      if (mounted.current) setError(sourceError(error));
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
        await jsonRequest(`${base}/generate`, {
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
        }),
      );
    } catch (error) {
      if (!mounted.current) return;
      try {
        settle(await status(id));
        setError(sourceError(error));
      } catch (recovery) {
        setError(sourceError(error));
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
        await jsonRequest(`${base}/generate/${requestId}/stop`, {
          method: "POST",
        }),
      );
    } catch (error) {
      setError(sourceError(error));
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
