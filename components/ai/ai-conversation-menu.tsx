"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/stores/workspace";
import type { AiConversation } from "@/lib/ai-context";
import { Icon } from "@/components/icon";
import { AiConversationRoom } from "./ai-conversation-room";
import { AiConversationDialog } from "./ai-conversation-dialog";
import "./ai-chatbot.css";

export function AiChatbotToggle() {
  const { aiMenuOpen, setAiMenuOpen, aiContext, user, aiConversationVersion } =
    useWorkspace();
  return (
    <div className="matrix-ai-navigation">
      <button
        type="button"
        className={`nav-item ${aiMenuOpen ? "active" : ""}`}
        aria-expanded={aiMenuOpen}
        aria-controls="matrix-ai-conversations"
        onClick={() => setAiMenuOpen(!aiMenuOpen)}
      >
        <Icon name="chatbot" size={19} />
        <span>AI Chatbot</span>
        <Icon
          name={aiMenuOpen ? "down" : "chevron"}
          size={14}
          className="matrix-ai-chevron"
        />
      </button>
      {aiMenuOpen && (
        <ConversationList
          key={`${user?.id}:${user?.workspaceId}:${aiContext.projectId}:${aiContext.pathname}`}
          version={aiConversationVersion}
        />
      )}
    </div>
  );
}
function ConversationList({ version }: { version: number }) {
  const { aiContext, aiConversation, selectAiConversation, user } =
    useWorkspace();
  const pathname = usePathname();
  const requiresProject =
    pathname.startsWith("/projects/") ||
    [
      "/requirements",
      "/screens",
      "/specifications",
      "/history",
      "/deliverables",
    ].includes(pathname);
  const ready =
    !!user &&
    aiContext.pathname === pathname &&
    (!requiresProject || !!aiContext.projectId);
  const [rooms, setRooms] = useState<AiConversation[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<{
    room: AiConversation;
    kind: "rename" | "delete";
  } | null>(null);
  const [loading, setLoading] = useState(true),
    [creating, setCreating] = useState(false);
  const [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const active = useRef(true),
    creatingRef = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    fetch(
      `/api/ai/conversations?projectId=${encodeURIComponent(aiContext.projectId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        setRooms(data.conversations);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "채팅방을 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [ready, aiContext.projectId, version, retry]);
  async function create() {
    if (!ready || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    const projectId = aiContext.projectId;
    try {
      const response = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      // A project switch or collapsed menu must not open a stale conversation.
      if (
        active.current &&
        useWorkspace.getState().aiContext.projectId === projectId
      ) {
        selectAiConversation(data.conversation);
        useWorkspace.getState().refreshAiConversations();
      }
    } catch (error) {
      if (active.current)
        setError(
          error instanceof Error
            ? error.message
            : "채팅방을 만들지 못했습니다.",
        );
    } finally {
      creatingRef.current = false;
      if (active.current) setCreating(false);
    }
  }
  function updateRoom(room: AiConversation) {
    setRooms((current) =>
      current
        .map((item) => (item.convId === room.convId ? room : item))
        .sort(
          (a, b) =>
            Number(b.isPinned) - Number(a.isPinned) ||
            b.updatedAt.localeCompare(a.updatedAt) ||
            b.convId.localeCompare(a.convId),
        ),
    );
  }
  function closeAction() {
    const id = action?.room.convId;
    setAction(null);
    requestAnimationFrame(() => {
      const button = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-room-options]"),
      ).find((item) => item.dataset.roomOptions === id);
      (
        button ??
        document.querySelector<HTMLButtonElement>(".matrix-ai-project-toggle")
      )?.focus();
    });
  }
  return (
    <div id="matrix-ai-conversations" className="matrix-ai-conversations">
      <button
        type="button"
        className="matrix-ai-project-toggle"
        aria-expanded={expanded}
        aria-controls="matrix-ai-project-chats"
        onClick={() => setExpanded(!expanded)}
      >
        <span title={aiContext.projectName || "공통 작업 공간"}>
          {aiContext.projectName ||
            (requiresProject ? "프로젝트 선택" : "공통 작업 공간")}
        </span>
        <Icon name={expanded ? "down" : "chevron"} size={15} />
      </button>
      {expanded && (
        <div id="matrix-ai-project-chats">
          <button
            type="button"
            className="matrix-ai-new-chat"
            disabled={!ready || creating}
            onClick={() => void create()}
          >
            {creating ? "생성 중…" : "+ 새 채팅"}
          </button>
          {error && (
            <p role="alert">
              {error}
              <button type="button" onClick={() => setRetry((v) => v + 1)}>
                다시 시도
              </button>
            </p>
          )}
          {!ready ? (
            <p>
              프로젝트를 선택하거나 불러오기가 끝난 뒤 채팅을 시작해 주세요.
            </p>
          ) : loading ? (
            <p role="status">채팅방을 불러오는 중입니다.</p>
          ) : !rooms.length ? (
            <p style={{ marginTop: 5, textAlign: "center" }}>
              새 채팅을 만들어 대화를 시작하세요.
            </p>
          ) : (
            <ul aria-label="채팅방 목록">
              {rooms.map((room) => (
                <AiConversationRoom
                  key={room.convId}
                  room={room}
                  selected={aiConversation?.convId === room.convId}
                  onSelect={() => selectAiConversation(room)}
                  onEdit={(kind) => setAction({ room, kind })}
                  onUpdate={(changed) => {
                    updateRoom(changed);
                    useWorkspace.getState().updateAiConversation(changed);
                  }}
                  onError={setError}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      {action && (
        <AiConversationDialog
          key={`${action.kind}:${action.room.convId}`}
          room={action.room}
          kind={action.kind}
          onClose={closeAction}
          onUpdate={updateRoom}
          onRemove={(id) =>
            setRooms((current) => current.filter((room) => room.convId !== id))
          }
        />
      )}
    </div>
  );
}
