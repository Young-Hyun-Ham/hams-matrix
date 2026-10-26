"use client";
import { useEffect, useRef } from "react";
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
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (last)
      end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [last]);
  return (
    <section className="matrix-ai-messages" aria-label="채팅방 대화">
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
              onClick={() => void conversation.loadOlder()}
            >
              {conversation.loadingOlder ? "불러오는 중…" : "이전 대화 더 보기"}
            </button>
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
      <div ref={end} />
    </section>
  );
}
