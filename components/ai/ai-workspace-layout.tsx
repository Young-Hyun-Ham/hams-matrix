"use client";
import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { useWorkspace } from "@/stores/workspace";
import { Icon } from "@/components/icon";
import { AiChatbot } from "./ai-chatbot";
import { useAiWindow } from "./use-ai-window";
import { usePathname } from "next/navigation";
import "./ai-workspace-layout.css";

function focusMenu() {
  const selector = window.matchMedia("(max-width: 700px)").matches
    ? '[aria-label="메뉴 열기"]'
    : '[aria-controls="matrix-ai-conversations"]';
  document.querySelector<HTMLButtonElement>(selector)?.focus();
}
export function AiWorkspaceLayout({ children }: { children: ReactNode }) {
  const {
    aiOpen: requestedOpen,
    setAiOpen,
    user,
    aiContext,
    aiConversation,
  } = useWorkspace();
  const pathname = usePathname();
  const aiOpen =
    requestedOpen &&
    !!aiConversation &&
    aiConversation.projectId === aiContext.projectId &&
    aiContext.pathname === pathname;
  const panel = useRef<HTMLElement>(null);
  const windowState = useAiWindow(panel, aiOpen);
  const { floating, expanded, position, dragging } = windowState;
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!aiOpen) return;
    const frame = requestAnimationFrame(() => {
      if (!floating && window.matchMedia("(max-width: 960px)").matches)
        closeButton.current?.focus();
    });
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.key === "Escape" &&
        !document.querySelector("dialog[open]") &&
        (!floating ||
          (event.target instanceof Node &&
            panel.current?.contains(event.target)))
      ) {
        event.preventDefault();
        setAiOpen(false);
        focusMenu();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [aiOpen, setAiOpen, floating]);
  function closePanel() {
    setAiOpen(false);
    focusMenu();
  }
  return (
    <div
      className={`workspace-content-layout ${aiOpen ? "ai-is-open" : ""} ${expanded ? "ai-is-expanded" : ""} ${floating ? "ai-is-floating" : ""} ${dragging ? "ai-is-dragging" : ""}`}
    >
      <button
        type="button"
        className="matrix-ai-backdrop"
        aria-label="AI 채팅 레이어 닫기"
        tabIndex={aiOpen && !floating ? 0 : -1}
        aria-hidden={!aiOpen || floating}
        onClick={closePanel}
      />
      <aside
        ref={panel}
        id="matrix-ai-panel"
        className="matrix-ai-drawer"
        role={floating ? "dialog" : undefined}
        aria-modal={floating ? false : undefined}
        style={
          floating
            ? ({
                "--ai-window-x": `${position.x}px`,
                "--ai-window-y": `${position.y}px`,
              } as CSSProperties)
            : undefined
        }
        aria-label="AI Chatbot 채팅"
        aria-hidden={!aiOpen}
        inert={!aiOpen}
      >
        <div className="matrix-ai-drawer-inner">
          <header className="matrix-ai-drawer-header">
            <button
              type="button"
              className="matrix-ai-drag-handle"
              disabled={!floating}
              aria-label={
                floating
                  ? "AI 채팅 창 이동. 드래그 또는 방향키로 이동"
                  : "AI Chatbot"
              }
              title={
                floating ? "제목을 드래그하거나 방향키로 이동하세요" : undefined
              }
              {...windowState.dragHandleProps}
            >
              <span className="matrix-ai-drawer-symbol">
                <Icon name="chatbot" size={20} />
              </span>
              <span className="matrix-ai-drawer-title">
                <strong title={aiConversation?.title}>
                  {aiConversation?.title || "AI Chatbot"}
                </strong>
                <small>
                  {floating ? "드래그하여 창 이동" : "현재 화면 도우미"}
                </small>
              </span>
            </button>
            <div className="matrix-ai-window-actions">
              <button
                type="button"
                className="icon-button"
                aria-label={
                  floating ? "AI 채팅 패널로 전환" : "AI 채팅 팝업으로 전환"
                }
                title={floating ? "패널로 전환" : "팝업으로 전환"}
                aria-pressed={floating}
                onClick={windowState.toggleFloating}
              >
                <Icon
                  name={floating ? "window-dock" : "window-popout"}
                  size={17}
                />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={expanded ? "AI 채팅 축소" : "AI 채팅 확대"}
                title={expanded ? "축소 · 패널 30%" : "확대 · 패널 50%"}
                aria-pressed={expanded}
                onClick={windowState.toggleExpanded}
              >
                <Icon
                  name={expanded ? "window-restore" : "window-expand"}
                  size={17}
                />
              </button>
              <button
                ref={closeButton}
                type="button"
                className="icon-button"
                aria-label="AI 채팅 닫기"
                onClick={closePanel}
              >
                <Icon name="close" size={19} />
              </button>
            </div>
          </header>
          <AiChatbot key={`${user?.id}:${user?.workspaceId}`} />
        </div>
      </aside>
      <div className="workspace-page-content">{children}</div>
    </div>
  );
}
