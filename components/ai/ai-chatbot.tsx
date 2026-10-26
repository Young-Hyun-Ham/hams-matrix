"use client";
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
import "./ai-chatbot.css";

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
  const { title, label, placeholder } = aiPresentation(context);
  const [prompt, setPrompt] = useState(""),
    [model, setModel] = useState(""),
    [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true),
    [modelError, setModelError] = useState(""),
    [modelVersion, setModelVersion] = useState(0);
  const [generating, setGenerating] = useState(false),
    [error, setError] = useState("");
  const conversationState = useAiConversation(conversation, aiOpen);
  const [result, setResult] = useState<AiChat | null>(null),
    [copyError, setCopyError] = useState("");
  const {
    images,
    imagesLoading,
    attachmentError,
    handlePaste,
    removeImage,
    restoreImages,
    clearImages,
  } = useAiImages(generating);
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
    if (!aiOpen) return;
    const controller = new AbortController();
    fetch("/api/ai/models", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setModelError("");
        setModels(data.models);
        setModel((current) =>
          data.models.includes(current) ? current : data.defaultModel,
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setModels([]);
          setModel("");
          setModelError(
            e instanceof Error ? e.message : "모델을 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setModelsLoading(false);
      });
    return () => controller.abort();
  }, [aiOpen, user?.id, user?.workspaceId, modelVersion]);
  useEffect(() => {
    if (result && aiOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [result, aiOpen]);
  const ready =
    !conversationState.loading &&
    !conversationState.error &&
    (!!prompt.trim() || images.length > 0) &&
    !imagesLoading &&
    !!model &&
    !generating &&
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
  async function generate() {
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setGenerating(true);
    setError("");
    setCopyError("");
    const requestScope = scope,
      controller = new AbortController();
    generation.current = controller;
    try {
      const response = await fetch("/api/ai/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          convId: conversation.convId,
          prompt: prompt.trim(),
          images: images.map((image) => ({ dataUrl: image.dataUrl })),
          model,
          pathname: context.pathname,
          projectId: context.projectId,
          tab: context.tab,
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.actions?.length) useWorkspace.getState().notifyAiChange();
      if (activeScope.current === requestScope) {
        conversationState.append(data.chat);
        setPrompt("");
        clearImages();
        requestAnimationFrame(() => promptInput.current?.focus());
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "AI 요청을 완료하지 못했습니다.",
        );
    } finally {
      busyRef.current = false;
      setGenerating(false);
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
          </header>
          <p
            className="matrix-ai-context"
            title={`${context.projectName} · ${label}`}
          >
            {context.projectName ? `${context.projectName} · ` : ""}
            {label}
          </p>
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
            Ctrl/⌘+V로 캡처 이미지 붙여넣기 · 최대 3장, 장당 2MB
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
          <label className="matrix-ai-model">
            <span>사용 모델</span>
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
                  setModelsLoading(true);
                  setModelError("");
                  setModelVersion((v) => v + 1);
                }}
              >
                다시 시도
              </button>
            </p>
          )}
          <button
            type="button"
            className="matrix-ai-generate"
            disabled={!ready}
            aria-busy={generating}
            onClick={() => void generate()}
          >
            {generating ? "생성 중…" : "생성하기"}
            <span>Ctrl/⌘ ↵</span>
          </button>
          <p className="matrix-ai-hint">
            현재 화면을 조회하고, 요청한 문서 변경을 처리합니다.
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
        className="workspace-dialog matrix-ai-result"
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
        <div className="dialog-header">
          <h2>AI 생성 결과</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="AI 결과 닫기"
            onClick={closeResult}
          >
            <Icon name="close" />
          </button>
        </div>
        {result && (
          <>
            <div className="matrix-ai-result-body">
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
            {copyError && (
              <p className="matrix-ai-error" role="alert">
                {copyError}
              </p>
            )}
            <div className="matrix-ai-result-actions">
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
