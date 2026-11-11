"use client";
import { useWorkspaceErrorState } from "@/components/query/use-workspace-error-state";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useConversationMutation } from "@/components/query/use-conversation-mutation";

import type { AiConversation } from "@/lib/ai-context";
import { useWorkspace } from "@/stores/workspace";
export function AiConversationTitle({
  conversation,
}: {
  conversation: AiConversation;
}) {
  const command = useConversationMutation(
    conversation.projectId,
    conversation.convId,
  );

  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(conversation.title);
  const [saving, setSaving] = useState(false),
    [error, setError] = useWorkspaceErrorState("");
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
      const data = await command.mutateAsync({ input: { title } });

      useWorkspace.getState().updateAiConversation(data.conversation);
      if (active.current) setEditing(false);
    } catch (error) {
      if (active.current) setError(error);
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
          {!conversation.convId.startsWith("temporary-") && (
            <button
              type="button"
              onClick={() => {
                setTitle(conversation.title);
                setEditing(true);
              }}
            >
              제목 변경
            </button>
          )}
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
