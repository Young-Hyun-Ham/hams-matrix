"use client";
import { AiChangeReview } from "./ai-change-review";
import { SharedAnswerControls } from "./shared-answer-dialog";
import { AiEvidence } from "./ai-evidence";
import { AiGuardrailApproval } from "./ai-guardrail-approval";
import type { GuardrailApproval } from "@/lib/ai/guardrail-approval-types";

import { useCallback, useLayoutEffect, useRef } from "react";
import type { AiChat } from "@/lib/ai-context";
import { AiImagePreview } from "./ai-image-preview";
import type { useAiConversation } from "./use-ai-conversation";
export function AiConversationMessages({
  conversation,
  generating,
  showResult,
  reuse,
  projectId = "",
  approvals = [],
  approvalError = false,
  onApprovalChanged = () => {},
  onResume = () => {},
  onStop = () => {},
}: {
  conversation: ReturnType<typeof useAiConversation>;
  generating: boolean;
  showResult: (chat: AiChat) => void;
  reuse: (chat: AiChat) => void;
  projectId?: string;
  approvals?: GuardrailApproval[];
  approvalError?: boolean;
  onApprovalChanged?: () => void;
  onResume?: (approval: GuardrailApproval) => void;
  onStop?: (approval: GuardrailApproval) => void;
}) {
  const entries = new Map<
    string,
    {
      id: string;
      seq: number;
      prompt: string;
      chat?: AiChat;
      approval?: GuardrailApproval;
    }
  >();
  for (const turn of conversation.turns ?? [])
    entries.set(turn.id, {
      id: turn.id,
      seq: turn.seq,
      prompt: turn.promptExcerpt,
    });
  for (const approval of approvals) {
    const id = approval.turnId ?? `approval:${approval.logicalRequestId}`;
    if (
      !entries.has(id) &&
      !conversation.chats.some((chat) => (chat.turnId ?? chat.id) === id) &&
      !["awaiting_choice", "pending", "approved", "resuming"].includes(
        approval.status,
      )
    )
      continue;
    const current = entries.get(id);
    if (
      !current?.approval ||
      (current.approval.sequence ?? 0) < (approval.sequence ?? 0) ||
      (current.approval.id === approval.id &&
        current.approval.version < approval.version)
    )
      entries.set(id, {
        ...current,
        id,
        seq: approval.turnSeq ?? current?.seq ?? 0,
        prompt: approval.promptExcerpt ?? current?.prompt ?? "",
        approval,
      });
  }
  for (const [index, chat] of conversation.chats.entries()) {
    const id = chat.turnId ?? chat.id;
    entries.set(id, {
      ...entries.get(id),
      id,
      seq: chat.turnSeq ?? index,
      prompt: chat.prompt,
      chat,
    });
  }
  const ordered = [...entries.values()].sort((a, b) => a.seq - b.seq);
  const last = ordered.at(-1)?.id;
  const resultActions = (chat: AiChat) => (
    <div className="matrix-ai-result-actions">
      <SharedAnswerControls
        projectId={projectId}
        chat={chat}
        disabled={generating}
      />
      <button type="button" onClick={() => showResult(chat)}>
        결과 크게 보기
      </button>
      <button type="button" disabled={generating} onClick={() => reuse(chat)}>
        다시 사용
      </button>
    </div>
  );
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
    if (
      previous.current.loadedVersion === 0 &&
      previous.current.loadedVersion !== conversation.loadedVersion
    ) {
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
          {!ordered.length && (
            <p className="matrix-ai-empty">
              이 채팅방에서 대화를 시작해 보세요.
            </p>
          )}
          {ordered.map(({ id, prompt, chat, approval }) =>
            chat ? (
              <article className="matrix-ai-turn" key={id} data-chat-id={id}>
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
                  {chat.sharedAnswer && (
                    <p>
                      공유 답변 · 버전 {chat.sharedAnswer.version}
                      {chat.sharedAnswer.unavailable
                        ? " · 현재 열람 불가"
                        : ` · 원래 답변 ${new Date(chat.sharedAnswer.originallyAnsweredAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`}
                      {chat.sharedAnswer.stale && !chat.sharedAnswer.unavailable
                        ? " · 당시 답변, 현재 근거 변경"
                        : ""}
                    </p>
                  )}
                  <small>
                    {chat.screenTitle} · {chat.model}
                  </small>
                  <pre>{chat.result}</pre>
                  <AiEvidence references={chat.references} />
                  {approval && (
                    <details className="matrix-ai-approval-history">
                      <summary>정책 승인 이력</summary>
                      <AiGuardrailApproval
                        key={approval.id}
                        approval={approval}
                        busy={generating || approvalError}
                        onChanged={onApprovalChanged}
                        onResume={() => onResume(approval)}
                        onStop={() => onStop(approval)}
                      />
                    </details>
                  )}
                  {chat.review && (
                    <AiChangeReview
                      initial={chat.review}
                      disabled={generating}
                      resultActions={resultActions(chat)}
                      revise={(feedback) =>
                        reuse({
                          ...chat,
                          prompt:
                            `${chat.prompt}\n수정 요청: ${feedback}`.slice(
                              0,
                              2000,
                            ),
                        })
                      }
                    />
                  )}
                  {!chat.review && (
                    <div className="matrix-ai-message-actions">
                      {resultActions(chat)}
                    </div>
                  )}
                </div>
              </article>
            ) : (
              <article className="matrix-ai-turn" key={id} data-chat-id={id}>
                <div className="matrix-ai-user-message">
                  <strong>나</strong>
                  <p>{prompt || "승인이 필요한 요청"}</p>
                </div>
                <div className="matrix-ai-assistant-message">
                  <strong>AI</strong>
                  {approval ? (
                    <AiGuardrailApproval
                      key={approval.id}
                      approval={approval}
                      busy={generating || approvalError}
                      onChanged={onApprovalChanged}
                      onResume={() => onResume(approval)}
                      onStop={() => onStop(approval)}
                    />
                  ) : (
                    <p role="status">승인 상태를 확인하고 있습니다.</p>
                  )}
                </div>
              </article>
            ),
          )}
        </>
      )}
      {generating && <p role="status">AI가 답변을 작성하고 있습니다.</p>}
    </section>
  );
}
