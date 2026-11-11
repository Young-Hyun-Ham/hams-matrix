"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import {
  aiPresentation,
  emptyAiContext,
  type AiChat,
  type AiConversation,
} from "@/lib/ai-context";
import { Icon } from "@/components/icon";
import { useAiImages } from "./use-ai-images";
import { AiImagePreview } from "./ai-image-preview";
import { useAiConversation } from "./use-ai-conversation";
import { AiConversationTitle } from "./ai-conversation-title";
import { AiConversationMessages } from "./ai-conversation-messages";
import { useAiTarget } from "./use-ai-target";
import { aiTargetContext, isAiTargetPage } from "@/lib/ai-target-pages";
import "./ai-chatbot.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceMutation as useMutation } from "@/components/query/use-workspace-mutation";
import { useWorkspaceQueryPolicy } from "@/components/query/workspace-query-runtime";
import { useSubscription } from "@/components/query/use-subscription";
import { useAiModels } from "@/components/query/use-ai-models";
import { matrixKeys } from "@/lib/query/keys";
import { requestJson } from "@/lib/query/browser-fetch";
import {
  RequestError,
  resolveWorkspaceError,
} from "@/lib/query/error-messages";
export function AiChatbot() {
  const { user, aiContext, aiConversation } = useWorkspace();
  if (!aiConversation || aiConversation.projectId !== aiContext.projectId)
    return null;
  return (
    <AiPanel
      key={`${user?.workspaceId}:${user?.id}:${aiConversation.convId}`}
      conversation={aiConversation}
    />
  );
}
function AiPanel({ conversation }: { conversation: AiConversation }) {
  const pathname = usePathname();
  const { aiOpen, aiContext, user } = useWorkspace();
  const context =
    aiContext.pathname === pathname
      ? aiContext
      : { ...emptyAiContext, pathname };
  const { label } = aiPresentation(context);
  const targetContext = conversation.targetPage
    ? aiTargetContext(
        conversation.targetPage,
        conversation.projectId,
        context.projectName,
      )
    : context;
  const { title, placeholder } = aiPresentation(targetContext);
  const [prompt, setPrompt] = useState(""),
    [selectedModel, setModel] = useState("");
  const {
    scope: queryScope,
    policy,
    settings,
  } = useWorkspaceQueryPolicy(
    user ? { userId: user.id, workspaceId: user.workspaceId } : undefined,
  );
  const client = useQueryClient();
  const subscription = useSubscription();
  const attachmentLimit = subscription.isError
    ? 0
    : (subscription.data?.plan.attachmentLimit ?? 0);
  const modelQuery = useAiModels(aiOpen);
  const models = modelQuery.data?.models ?? [];
  const model = models.includes(selectedModel)
    ? selectedModel
    : (modelQuery.data?.defaultModel ?? "");
  const modelsLoading = modelQuery.isFetching,
    modelError = modelQuery.isFetching
      ? ""
      : resolveWorkspaceError(modelQuery.error, settings.errorMessages);
  const setModelVersion = () => {
    void modelQuery.refetch();
  };
  const stopCommand = useMutation({
    mutationFn: (input: object) =>
      requestJson<{ settled: boolean; actions?: unknown[] }>(
        "/api/ai/chats/stop",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    retry: false,
  });
  const [generating, setGenerating] = useState(false),
    [error, setError] = useWorkspaceErrorState("");
  const [stopping, setStopping] = useState(false),
    [notice, setNotice] = useState("");
  const [stopRetry, setStopRetry] = useState<string | null>(null);
  type Usage = {
    input: number;
    output: number;
    unknown: number;
    pending: number;
    calls: number;
  };
  const [usageRequest, setUsageRequest] = useState("");
  const usageQuery = useQuery({
    queryKey: [
      ...matrixKeys.scope(queryScope),
      "ai",
      "chat-usage",
      usageRequest,
    ],
    queryFn: ({ signal }) =>
      requestJson<Usage>(`/api/ai/chats/usage?requestId=${usageRequest}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      }),
    ...policy,
    enabled: generating && Boolean(usageRequest),
    refetchInterval: 1000,
  });
  const usage = usageQuery.data ?? null;
  const activeRequest = useRef<string | null>(null);
  const stopBusy = useRef(false);
  const conversationState = useAiConversation(conversation, aiOpen);
  const target = useAiTarget(
    conversation,
    context,
    user,
    !conversationState.loading && !conversationState.error,
    aiOpen,
  );
  const [result, setResult] = useState<AiChat | null>(null),
    [copyError, setCopyError] = useWorkspaceErrorState("");
  const {
    images,
    imagesLoading,
    attachmentError,
    handlePaste,
    removeImage,
    restoreImages,
    clearImages,
  } = useAiImages(generating || attachmentLimit === 0, attachmentLimit);
  const dialog = useRef<HTMLDialogElement>(null),
    promptInput = useRef<HTMLTextAreaElement>(null),
    resultSession = useRef(0),
    busyRef = useRef(false),
    generation = useRef<AbortController | null>(null);
  const scope = `${user?.workspaceId}:${user?.id}:${context.projectId}`;
  const activeScope = useRef(scope);
  useEffect(() => {
    activeScope.current = scope;
  }, [scope]);
  useEffect(() => () => generation.current?.abort(), []);
  useEffect(() => {
    if (result && aiOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [result, aiOpen]);
  const ready =
    !conversationState.loading &&
    !conversationState.error &&
    target.ready &&
    (!!prompt.trim() || images.length > 0) &&
    !imagesLoading &&
    !!model &&
    !generating &&
    !stopRetry &&
    !modelsLoading &&
    !!user &&
    context.pathname === pathname &&
    (!pathname.startsWith("/projects/") || !!context.projectId);
  function closeResult() {
    resultSession.current += 1;
    dialog.current?.close();
    setResult(null);
    setPrompt("");
    clearImages();
    setError("");
    setCopyError("");
    requestAnimationFrame(() => promptInput.current?.focus());
  }
  async function stopGeneration() {
    const requestId = activeRequest.current ?? stopRetry;
    if (
      !requestId ||
      stopBusy.current ||
      !window.confirm(
        "AI 생성을 중지하시겠습니까? 이미 반영된 변경사항은 유지됩니다.",
      )
    )
      return;
    stopBusy.current = true;
    setStopping(true);
    try {
      const data = await stopCommand.mutateAsync({
        requestId,
        convId: conversation.convId,
        projectId: conversation.projectId,
      });
      if (data.settled && activeRequest.current === null) {
        setStopRetry(null);
        setStopping(false);
        setError("");
        setNotice(
          "생성이 중지되었습니다." +
            (data.actions?.length
              ? ` 이미 반영된 작업 ${data.actions.length}건은 유지됩니다.`
              : ""),
        );
      }
      // Keep awaiting the generation response: it confirms cleanup and committed actions.
    } catch (e) {
      if (activeRequest.current === requestId || stopRetry === requestId) {
        setStopping(false);
        setError(
          e instanceof RequestError
            ? e
            : e instanceof Error
              ? e.message
              : "중지 요청에 실패했습니다. 다시 시도해 주세요.",
        );
      }
    } finally {
      stopBusy.current = false;
    }
  }
  async function generate() {
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setGenerating(true);
    setError("");
    setCopyError("");
    setNotice("");
    setStopping(false);
    setStopRetry(null);
    const requestId = crypto.randomUUID();
    const updateUsage = async () => {
      await client
        .query({
          queryKey: [
            ...matrixKeys.scope(queryScope),
            "ai",
            "chat-usage",
            requestId,
          ],
          queryFn: ({ signal }) =>
            requestJson<Usage>(`/api/ai/chats/usage?requestId=${requestId}`, {
              signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
            }),
          staleTime: 0,
          retry: false,
        })
        .catch(() => undefined);
    };
    const requestScope = scope,
      controller = new AbortController();
    generation.current = controller;
    let submitted = false;
    try {
      await target.verify(controller.signal);
      if (activeScope.current !== requestScope || controller.signal.aborted)
        return;
      activeRequest.current = requestId;
      setUsageRequest(requestId);
      submitted = true;
      const response = await fetch("/api/ai/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          convId: conversation.convId,
          ...(conversation.convId.startsWith("temporary-")
            ? {
                history: conversationState.chats.slice(-5).flatMap((chat) => [
                  { role: "user", content: chat.prompt.slice(0, 2000) },
                  { role: "assistant", content: chat.result.slice(0, 8000) },
                ]),
              }
            : {}),
          prompt: prompt.trim(),
          images: images.map((image) => ({ dataUrl: image.dataUrl })),
          model,
          pathname: context.pathname,
          projectId: context.projectId,
          tab: context.tab,
          sourceContext: { pathname: context.pathname, tab: context.tab },
          targetPage: conversation.targetPage,
          expectedTargetVersion: conversation.targetVersion,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (data.conversation)
        useWorkspace.getState().updateAiConversation(data.conversation);
      if (data.stopUnconfirmed) setStopRetry(requestId);
      if (data.actions?.length) useWorkspace.getState().notifyAiChange();
      if (!response.ok)
        throw new RequestError(
          response.status,
          data.code,
          data.details,
          requestId,
        );
      if (data.cancelled) {
        setError("");
        setNotice(
          "생성이 중지되었습니다." +
            (data.actions?.length
              ? ` 이미 반영된 작업: ${data.actions.map((action: { code: string; title: string }) => `${action.code} · ${action.title}`).join(", ")}`
              : ""),
        );
        return;
      }
      if (activeScope.current === requestScope) {
        conversationState.append(data.chat);
        setPrompt("");
        clearImages();
        requestAnimationFrame(() => promptInput.current?.focus());
      }
    } catch (e) {
      if (!controller.signal.aborted && activeScope.current === requestScope)
        setError(
          e instanceof RequestError
            ? e
            : e instanceof Error
              ? e.message
              : "AI 요청을 완료하지 못했습니다.",
        );
    } finally {
      if (submitted) await updateUsage();
      activeRequest.current = null;
      busyRef.current = false;
      setGenerating(false);
      setStopping(false);
      generation.current = null;
    }
  }
  return (
    <div className="matrix-ai">
      <div className="matrix-ai-panel-content">
        <AiConversationTitle conversation={conversation} />
        <AiConversationMessages
          conversation={conversationState}
          generating={generating}
          showResult={(chat) => {
            setCopyError("");
            setResult(chat);
          }}
          reuse={(chat) => {
            void (async () => {
              if (generating || !(await restoreImages(chat.images ?? [])))
                return;
              setPrompt(chat.prompt);
              if (models.includes(chat.model)) setModel(chat.model);
              promptInput.current?.focus();
            })();
          }}
        />
        <section className="matrix-ai-card" aria-label="AI 생성 도우미">
          <header>
            <span className="matrix-ai-spark">
              <Icon name="spark" size={16} />
            </span>
            <strong>{title}</strong>
            <label className="matrix-ai-model">
              {/* <span>사용 모델</span> */}
              <select
                aria-label="AI 사용 모델"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={modelsLoading || generating || !models.length}
              >
                {!models.length ? (
                  <option value="">
                    {modelsLoading ? "불러오는 중…" : "모델 없음"}
                  </option>
                ) : (
                  models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))
                )}
              </select>
            </label>
            {modelError && (
              <p className="matrix-ai-error" role="alert">
                {modelError}
                <button
                  type="button"
                  onClick={() => {
                    setModelVersion();
                  }}
                >
                  다시 시도
                </button>
              </p>
            )}
          </header>
          <div className="matrix-ai-context-row">
            <p
              className="matrix-ai-context"
              title={`${context.projectName} · ${label}`}
            >
              현재: {context.projectName ? `${context.projectName} · ` : ""}
              {label}
            </p>
            <label className="matrix-ai-target">
              <span>AI 대상 페이지</span>
              <select
                aria-label="AI 대상 페이지"
                value={conversation.targetPage ?? ""}
                disabled={
                  generating ||
                  stopping ||
                  !!stopRetry ||
                  target.saving ||
                  target.initializing ||
                  conversationState.loading
                }
                onChange={(event) => {
                  if (isAiTargetPage(event.target.value))
                    void target.change(event.target.value);
                }}
              >
                {!conversation.targetPage && (
                  <option value="">대상 확인 중…</option>
                )}
                {target.options.map((option) => (
                  <option
                    key={option.key}
                    value={option.key}
                    disabled={!option.supported || !option.allowed}
                  >
                    {option.label}
                    {!option.supported
                      ? " (미지원)"
                      : !option.allowed
                        ? " (접근 불가)"
                        : option.readOnly
                          ? " (조회 전용)"
                          : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(target.saving || target.initializing) && (
            <p className="matrix-ai-hint" role="status">
              AI 대상을 저장하는 중입니다.
            </p>
          )}
          {!target.supported && !!conversation.targetPage && (
            <p className="matrix-ai-hint">
              현재 대상은 AI 미지원입니다. 다른 AI 대상을 선택해 주세요.
            </p>
          )}
          {target.error && (
            <p className="matrix-ai-error" role="alert">
              {target.error}{" "}
              {!conversation.targetPage && (
                <button type="button" onClick={target.retry}>
                  다시 시도
                </button>
              )}
            </p>
          )}
          {target.accessError && (
            <p className="matrix-ai-error" role="alert">
              {target.accessError}{" "}
              <button type="button" onClick={target.retryAccess}>
                권한 다시 확인
              </button>
            </p>
          )}
          <textarea
            ref={promptInput}
            aria-label="AI 요청 내용"
            aria-describedby="matrix-ai-image-help"
            onPaste={handlePaste}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={placeholder}
            maxLength={2000}
            disabled={generating}
            onKeyDown={(e) => {
              if (
                !e.nativeEvent.isComposing &&
                (e.ctrlKey || e.metaKey) &&
                e.key === "Enter"
              ) {
                e.preventDefault();
                void generate();
              }
            }}
          />
          <p id="matrix-ai-image-help" className="matrix-ai-image-help">
            Ctrl/⌘+V로 캡처 이미지 붙여넣기 · 최대 {attachmentLimit}장, 장당 2MB
          </p>
          {imagesLoading && (
            <p role="status" className="matrix-ai-image-help">
              이미지를 준비하는 중입니다.
            </p>
          )}
          {images.length > 0 && (
            <div className="matrix-ai-attachments" aria-label="첨부 이미지">
              {images.map((image, index) => (
                <figure key={image.id}>
                  <AiImagePreview
                    src={image.dataUrl}
                    label={`첨부 캡처 ${index + 1}`}
                  />
                  <figcaption>
                    {image.width} × {image.height} ·{" "}
                    {Math.ceil(image.byteLength / 1024)}KB
                  </figcaption>
                  <button
                    type="button"
                    disabled={generating}
                    className="matrix-ai-remove-image"
                    aria-label={`첨부 이미지 ${index + 1} 삭제`}
                    onClick={() => removeImage(image.id)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </figure>
              ))}
            </div>
          )}
          {attachmentError && (
            <p className="matrix-ai-error" role="alert">
              {attachmentError}
            </p>
          )}
          <button
            type="button"
            className="matrix-ai-generate"
            disabled={generating || stopRetry ? stopping : !ready}
            aria-busy={generating}
            onClick={() =>
              void (generating || stopRetry ? stopGeneration() : generate())
            }
          >
            {generating || stopRetry
              ? stopping
                ? "중지 중…"
                : stopRetry
                  ? "중지 재시도"
                  : "중지"
              : "생성하기"}
            {!generating && !stopRetry && <span>Ctrl/⌘ ↵</span>}
          </button>
          {notice && (
            <p role="status" className="matrix-ai-hint">
              {notice}
            </p>
          )}
          {usage && (
            <p role="status" className="matrix-ai-hint">
              확인된 토큰: 입력{" "}
              {usage.calls > usage.unknown
                ? usage.input.toLocaleString()
                : "미확인"}{" "}
              · 출력{" "}
              {usage.calls > usage.unknown
                ? usage.output.toLocaleString()
                : "미확인"}
              {(!usage.calls || usage.unknown > 0 || usage.pending > 0) &&
                " · 사용량 미확인/집계 중 포함"}
            </p>
          )}
          <p className="matrix-ai-hint">
            선택한 AI 대상을 조회하고, 요청한 문서 변경을 처리합니다.
          </p>
          {error && (
            <p className="matrix-ai-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      <dialog
        ref={dialog}
        className="workspace-dialog admin-detail-dialog matrix-ai-result"
        aria-labelledby="matrix-ai-result-title"
        onCancel={(event) => {
          if (event.target === event.currentTarget) {
            event.preventDefault();
            closeResult();
          }
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeResult();
        }}
      >
        <div className="dialog-header admin-detail-header">
          <h2 id="matrix-ai-result-title">AI 생성 결과</h2>
          <button
            type="button"
            className="button admin-detail-close"
            aria-label="AI 결과 닫기"
            onClick={closeResult}
          >
            닫기
          </button>
        </div>
        {result && (
          <>
            <div className="admin-detail-body matrix-ai-result-body">
              <p className="matrix-ai-result-context">
                {result.screenTitle} · {result.model}
              </p>
              <p className="matrix-ai-result-prompt">{result.prompt}</p>
              {!!result.images?.length && (
                <div
                  className="matrix-ai-saved-images"
                  aria-label="기록 첨부 이미지"
                >
                  {result.images.map((image, index) => (
                    <AiImagePreview
                      key={image.id}
                      src={image.url}
                      label={`저장된 캡처 ${index + 1}`}
                    />
                  ))}
                </div>
              )}
              <pre>{result.result}</pre>
            </div>
            <div className="project-registration-footer matrix-ai-result-actions">
              {copyError && (
                <p className="matrix-ai-error" role="alert">
                  {copyError}
                </p>
              )}
              <span>조회 내용과 서버의 실행 결과를 확인하세요.</span>
              <button
                type="button"
                className="button"
                onClick={async () => {
                  const session = resultSession.current;
                  setCopyError("");
                  try {
                    await navigator.clipboard.writeText(result.result);
                    if (session === resultSession.current) closeResult();
                  } catch {
                    if (session === resultSession.current)
                      setCopyError("복사하지 못했습니다. 다시 시도해 주세요.");
                  }
                }}
              >
                결과 복사
              </button>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
