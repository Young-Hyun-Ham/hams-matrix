"use client";
import { useState } from "react";
import type { Settings } from "@/lib/chatbot/types";
import { chatbotThemes } from "@/lib/chatbot/theme-presets";
import { errorMessage, useChatbotClient } from "./runtime";
export function ChatbotSettings({
  saved,
  preview,
  close,
}: {
  saved: Settings;
  preview: (v: Settings) => void;
  close: (saved?: Settings) => void;
}) {
  const [draft, setDraft] = useState(saved),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const api = useChatbotClient(),
    en = draft.language === "en";
  function update(value: Partial<Settings>) {
    const next = { ...draft, ...value };
    setDraft(next);
    preview(next);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api.send<Settings>("settings", "PATCH", {
        ...draft,
        expectedVersion: draft.version,
      });
      await api.refresh();
      close(result);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="chatbot-settings chatbot-sub-layer"
      aria-label={en ? "Personal settings" : "개인 설정"}
    >
      <h3>{en ? "Personal Settings" : "개인 설정"}</h3>
      <fieldset>
        <legend>{en ? "Color theme" : "색상 테마"}</legend>
        <div className="chatbot-swatches">
          {Object.entries(chatbotThemes).map(([id, colors]) => (
            <button
              key={id}
              aria-label={id}
              aria-pressed={draft.themePreset === id}
              onClick={() => update({ themePreset: id })}
              style={{
                background: `linear-gradient(${colors[0]} 35%,${colors[1]} 35%,${colors[1]} 70%,${colors[2]} 70%)`,
                color: "#fff",
              }}
            >
              {draft.themePreset === id ? "✓" : ""}
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        {en ? "Language" : "언어"}
        <select
          value={draft.language}
          onChange={(e) => update({ language: e.target.value as "ko" | "en" })}
        >
          <option value="ko">한국어</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="chatbot-check">
        <input
          type="checkbox"
          checked={draft.truncateLongResponses}
          onChange={(e) => update({ truncateLongResponses: e.target.checked })}
        />
        {en ? "Collapse long responses" : "긴 답변 접기"}
      </label>
      <label>
        {en ? "Input placeholder" : "입력 안내 문구"}
        <input
          maxLength={150}
          value={draft.inputPlaceholder}
          onChange={(e) => update({ inputPlaceholder: e.target.value })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button onClick={() => close()} disabled={busy}>
          {en ? "Cancel" : "취소"}
        </button>
        <button
          className="chatbot-primary"
          onClick={save}
          disabled={busy || !draft.inputPlaceholder.trim()}
        >
          {en ? "Save" : "저장"}
        </button>
      </footer>
    </section>
  );
}
