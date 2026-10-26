"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { AiConversation } from "@/lib/ai-context";
import { Icon } from "@/components/icon";

export function AiConversationRoom({
  room,
  selected,
  onSelect,
  onEdit,
  onUpdate,
  onError,
}: {
  room: AiConversation;
  selected: boolean;
  onSelect: () => void;
  onEdit: (kind: "rename" | "delete") => void;
  onUpdate: (room: AiConversation) => void;
  onError: (message: string) => void;
}) {
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const busy = useRef(false),
    menuId = useId();
  useEffect(() => {
    if (!position) return;
    const frame = requestAnimationFrame(() =>
      menu.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      )
        setPosition(null);
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
      trigger.current?.focus();
    }
    function close() {
      setPosition(null);
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [position]);
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowUp")
      next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = buttons.length - 1;
    else return;
    event.preventDefault();
    buttons[next]?.focus();
  }
  async function togglePin() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setPosition(null);
    trigger.current?.focus();
    try {
      const response = await fetch(
        `/api/ai/conversations/${encodeURIComponent(room.convId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: room.projectId,
            isPinned: !room.isPinned,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onUpdate(data.conversation);
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "고정 상태를 변경하지 못했습니다.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <li className={`matrix-ai-room-row ${selected ? "is-selected" : ""}`}>
      <button
        type="button"
        className={`matrix-ai-room ${selected ? "is-selected" : ""}`}
        aria-current={selected ? "true" : undefined}
        data-conv-id={room.convId}
        title={room.title}
        onClick={onSelect}
      >
        <span className="matrix-ai-room-heading">
          {room.isPinned && (
            <Icon name="pin" size={12} className="matrix-ai-pinned-icon" />
          )}
          <span className="matrix-ai-room-title">{room.title}</span>
          {room.isPinned && <span className="sr-only">고정됨</span>}
        </span>
        <time dateTime={room.updatedAt}>
          {new Date(room.updatedAt).toLocaleDateString("ko-KR")}
        </time>
      </button>
      <button
        ref={trigger}
        type="button"
        className="matrix-ai-room-options"
        data-room-options={room.convId}
        aria-label={`${room.title} 채팅방 옵션`}
        aria-haspopup="menu"
        aria-expanded={!!position}
        aria-controls={position ? menuId : undefined}
        disabled={pending}
        onClick={() => {
          if (position) {
            setPosition(null);
            return;
          }
          const rect = trigger.current?.getBoundingClientRect();
          if (!rect) return;
          setPosition({
            left: Math.max(8, Math.min(innerWidth - 184, rect.right - 176)),
            top: Math.max(
              8,
              rect.bottom + 140 < innerHeight
                ? rect.bottom + 4
                : rect.top - 136,
            ),
          });
        }}
      >
        <Icon name="more" size={19} />
      </button>
      {position &&
        createPortal(
          <div
            id={menuId}
            ref={menu}
            role="menu"
            aria-label="채팅방 옵션"
            className="matrix-ai-room-menu"
            style={position}
            onKeyDown={navigate}
            onBlur={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                !event.currentTarget.contains(event.relatedTarget) &&
                !trigger.current?.contains(event.relatedTarget)
              )
                setPosition(null);
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => void togglePin()}
            >
              <Icon name="pin" size={16} />
              {room.isPinned ? "고정 해제" : "고정"}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setPosition(null);
                onEdit("rename");
              }}
            >
              <Icon name="edit" size={16} />
              제목 변경
            </button>
            <button
              type="button"
              role="menuitem"
              className="is-destructive"
              onClick={() => {
                setPosition(null);
                onEdit("delete");
              }}
            >
              <Icon name="trash" size={16} />
              삭제
            </button>
          </div>,
          document.body,
        )}
    </li>
  );
}
