"use client";
import { useRef, useState } from "react";
import type { Clarification } from "@/lib/chatbot/types";
import { errorMessage, useChatbotClient } from "./runtime";
export function ClarificationCard({
  value,
  refresh,
  en,
}: {
  value: Clarification;
  refresh: () => Promise<unknown>;
  en: boolean;
}) {
  const api = useChatbotClient(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [custom, setCustom] = useState<string | null>(null),
    [input, setInput] = useState("");
  const key = useRef<{ payload: string; id: string } | null>(null);
  async function submit(cancel: boolean, answer: Record<string, string> = {}) {
    const body = { expectedVersion: value.version, ...answer },
      payload = JSON.stringify({ id: value.id, cancel, body });
    if (key.current?.payload !== payload)
      key.current = { payload, id: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await api.send(
        `clarifications/${value.id}/${cancel ? "cancel" : "answers"}`,
        "POST",
        { ...body, clientRequestId: key.current.id },
      );
      key.current = null;
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="chatbot-clarification chatbot-review"
      aria-label={en ? "Clarification" : "정보 선택"}
    >
      <strong>{value.title}</strong>
      <p>{value.message}</p>
      {value.canAnswer ? (
        <>
          {custom === null ? (
            <div className="chatbot-actions">
              {value.options.map((c) => (
                <button
                  key={c.id}
                  disabled={busy}
                  onClick={() =>
                    c.action === "custom"
                      ? setCustom(c.id)
                      : void submit(false, { optionId: c.id })
                  }
                >
                  {c.label}
                </button>
              ))}
              {value.allowCustom && (
                <button disabled={busy} onClick={() => setCustom("")}>
                  {en ? "Specify" : "직접 지정"}
                </button>
              )}
            </div>
          ) : (
            <form
              className="chatbot-clarification-input"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim())
                  void submit(false, {
                    ...(custom ? { optionId: custom } : {}),
                    customValue: input.trim(),
                  });
              }}
            >
              <label>
                {en ? "Your choice" : "선택할 내용"}
                <input
                  autoFocus
                  aria-label={en ? "Specify choice" : "선택 내용 직접 입력"}
                  maxLength={500}
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                />
              </label>
              <div className="chatbot-actions">
                <button disabled={busy || !input.trim()} type="submit">
                  {en ? "Continue" : "선택하고 계속"}
                </button>
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => setCustom(null)}
                >
                  {en ? "Back" : "뒤로"}
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <p role="status">
          {value.selected
            ? `${en ? "Selected" : "선택 완료"}: ${value.selected.label}`
            : ({
                expired: "선택 시간이 만료되었습니다.",
                cancelled: "취소되었습니다.",
                invalidated: "더 이상 사용할 수 없는 선택입니다.",
              }[value.status] ?? "처리 상태를 확인해 주세요.")}
        </p>
      )}
      {busy && (
        <p role="status">{en ? "Submitting…" : "선택을 처리하고 있습니다…"}</p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="chatbot-actions chatbot-clarification-controls">
        {value.canAnswer && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            {en ? "Cancel" : "취소"}
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          {en ? "Refresh" : "상태 새로고침"}
        </button>
      </div>
    </section>
  );
}
