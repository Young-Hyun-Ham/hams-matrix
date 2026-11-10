"use client";
import { useCallback, useLayoutEffect, useRef } from "react";
import type { AiChat } from "@/lib/ai-context";
import { AiImagePreview } from "./ai-image-preview";
import type { useAiConversation } from "./use-ai-conversation";
export function AiConversationMessages({
  conversation,
  generating,
  showResult,
  reuse,
}: {
  conversation: ReturnType<typeof useAiConversation>;
  generating: boolean;
  showResult: (chat: AiChat) => void;
  reuse: (chat: AiChat) => void;
}) {
  const last = conversation.chats.at(-1)?.id;
  const container = useRef<HTMLElement>(null);
  const previous = useRef({ last, loadedVersion: 0, scrollTop: 0 });
  const paging = useRef(false);
  const bottom = useRef(true);
  const anchor = useRef<{
    element: HTMLElement | null;
    offset: number;
    height: number;
    scrollTop: number;
  } | null>(null);
  const scrollToBottom = useCallback(() => {
    const element = container.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    previous.current.scrollTop = element.scrollTop;
    bottom.current = true;
  }, []);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element || conversation.loading) return;
    if (previous.current.loadedVersion !== conversation.loadedVersion) {
      anchor.current = null;
      scrollToBottom();
    } else if (anchor.current) {
      const saved = anchor.current;
      if (saved.element?.isConnected)
        element.scrollTop +=
          saved.element.getBoundingClientRect().top -
          element.getBoundingClientRect().top -
          saved.offset;
      else
        element.scrollTop =
          saved.scrollTop + element.scrollHeight - saved.height;
      previous.current.scrollTop = element.scrollTop;
      bottom.current =
        element.scrollHeight - element.clientHeight - element.scrollTop <= 24;
      if (!conversation.loadingOlder) anchor.current = null;
    } else if (previous.current.last !== last || bottom.current) {
      scrollToBottom();
    }
    previous.current.last = last;
    previous.current.loadedVersion = conversation.loadedVersion;
  }, [
    conversation.chats,
    conversation.loading,
    conversation.loadingOlder,
    conversation.olderError,
    conversation.loadedVersion,
    generating,
    last,
    scrollToBottom,
  ]);
  async function loadOlder() {
    const element = container.current;
    if (
      !element ||
      paging.current ||
      conversation.loading ||
      conversation.loadingOlder ||
      !conversation.nextCursor
    )
      return;
    const top = element.getBoundingClientRect().top;
    const firstVisible =
      Array.from(element.querySelectorAll<HTMLElement>("[data-chat-id]")).find(
        (chat) => chat.getBoundingClientRect().bottom > top,
      ) ?? null;
    anchor.current = {
      element: firstVisible,
      offset: firstVisible ? firstVisible.getBoundingClientRect().top - top : 0,
      height: element.scrollHeight,
      scrollTop: element.scrollTop,
    };
    paging.current = true;
    try {
      await conversation.loadOlder();
    } finally {
      paging.current = false;
    }
  }
  return (
    <section
      ref={container}
      className="matrix-ai-messages"
      aria-label="채팅방 대화"
      onScroll={(event) => {
        const element = event.currentTarget;
        const upward = element.scrollTop < previous.current.scrollTop;
        if (
          anchor.current &&
          element.scrollTop !== previous.current.scrollTop
        ) {
          const saved = anchor.current;
          if (saved.element?.isConnected)
            saved.offset =
              saved.element.getBoundingClientRect().top -
              element.getBoundingClientRect().top;
          saved.height = element.scrollHeight;
          saved.scrollTop = element.scrollTop;
        }
        previous.current.scrollTop = element.scrollTop;
        bottom.current =
          element.scrollHeight - element.clientHeight - element.scrollTop <= 24;
        if (upward && element.scrollTop <= 48 && !conversation.olderError)
          void loadOlder();
      }}
      onWheel={(event) => {
        if (
          event.deltaY < 0 &&
          event.currentTarget.scrollTop <= 48 &&
          !conversation.olderError
        )
          void loadOlder();
      }}
      onLoadCapture={() => {
        if (bottom.current && !anchor.current) scrollToBottom();
      }}
    >
      {conversation.loading ? (
        <p role="status">대화를 불러오는 중입니다.</p>
      ) : conversation.error ? (
        <p role="alert">
          {conversation.error}
          <button type="button" onClick={conversation.retry}>
            다시 시도
          </button>
        </p>
      ) : (
        <>
          {conversation.nextCursor && (
            <button
              className="matrix-ai-older"
              type="button"
              disabled={conversation.loadingOlder}
              onClick={() => void loadOlder()}
            >
              {conversation.loadingOlder ? "불러오는 중…" : "이전 대화 더 보기"}
            </button>
          )}
          {conversation.olderError && (
            <p role="alert">
              {conversation.olderError} 위 버튼으로 다시 시도해 주세요.
            </p>
          )}
          {!conversation.chats.length && (
            <p className="matrix-ai-empty">
              이 채팅방에서 대화를 시작해 보세요.
            </p>
          )}
          {conversation.chats.map((chat) => (
            <article
              className="matrix-ai-turn"
              key={chat.id}
              data-chat-id={chat.id}
            >
              <div className="matrix-ai-user-message">
                <strong>나</strong>
                <p>{chat.prompt}</p>
                {!!chat.images?.length && (
                  <div className="matrix-ai-saved-images">
                    {chat.images.map((image, index) => (
                      <AiImagePreview
                        key={image.id}
                        src={image.url}
                        label={`대화 첨부 캡처 ${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div className="matrix-ai-assistant-message">
                <strong>AI</strong>
                <small>
                  {chat.screenTitle} · {chat.model}
                </small>
                <pre>{chat.result}</pre>
                <div className="matrix-ai-message-actions">
                  <button type="button" onClick={() => showResult(chat)}>
                    결과 크게 보기
                  </button>
                  <button
                    type="button"
                    disabled={generating}
                    onClick={() => reuse(chat)}
                  >
                    다시 사용
                  </button>
                </div>
              </div>
            </article>
          ))}
        </>
      )}
      {generating && <p role="status">AI가 답변을 작성하고 있습니다.</p>}
    </section>
  );
}
