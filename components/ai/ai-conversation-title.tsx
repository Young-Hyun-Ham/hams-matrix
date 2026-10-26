"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AiConversation } from "@/lib/ai-context";
import { useWorkspace } from "@/stores/workspace";
export function AiConversationTitle({
  conversation,
}: {
  conversation: AiConversation;
}) {
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(conversation.title);
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true),
    busy = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ai/conversations/${encodeURIComponent(conversation.convId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: conversation.projectId, title }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      useWorkspace.getState().updateAiConversation(data.conversation);
      if (active.current) setEditing(false);
    } catch (error) {
      if (active.current)
        setError(
          error instanceof Error
            ? error.message
            : "제목을 변경하지 못했습니다.",
        );
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  }
  return (
    <section className="matrix-ai-conversation-title" aria-label="채팅방 제목">
      {editing ? (
        <form onSubmit={save}>
          <input
            autoFocus
            aria-label="채팅방 제목 입력"
            value={title}
            maxLength={100}
            required
            disabled={saving}
            onChange={(event) => setTitle(event.target.value)}
          />
          <button type="submit" disabled={saving || !title.trim()}>
            {saving ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setError("");
            }}
          >
            취소
          </button>
        </form>
      ) : (
        <div>
          <strong title={conversation.title}>{conversation.title}</strong>
          <button
            type="button"
            onClick={() => {
              setTitle(conversation.title);
              setEditing(true);
            }}
          >
            제목 변경
          </button>
        </div>
      )}
      {error && (
        <p className="matrix-ai-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
