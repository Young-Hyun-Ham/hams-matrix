"use client";
import { boardFetch as fetch } from "@/app/(editor)/planning-board/lib/client-api";

import { useEffect, useState } from "react";
import { usePlanningAccess } from "@/app/(editor)/planning-board/stores/editor-provider";
import { Icon } from "./editor-icon";

type AiPromptChat = {
  id: string;
  prompt: string;
  model: string;
  screenTitle: string;
  createdAt: string | null;
};

type Props = {
  prompt: string;
  onPromptChange: (value: string) => void;
  models: string[];
  model: string;
  onModelChange: (value: string) => void;
  modelsLoading: boolean;
  modelWarning: string;
  projectId?: string;
  aiHistoryVersion: number;
  onGenerate: () => void;
  generating: boolean;
  readOnly: boolean;
};

export function AiScreenGenerator({
  prompt,
  onPromptChange,
  models,
  model,
  onModelChange,
  modelsLoading,
  modelWarning,
  projectId,
  aiHistoryVersion,
  onGenerate,
  generating,
  readOnly,
}: Props) {
  const aiEnabled = usePlanningAccess((state) => state.aiEnabled);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiHistory, setAiHistory] = useState<AiPromptChat[]>([]);
  const [aiHistoryLoading, setAiHistoryLoading] = useState(true);
  const [aiHistoryError, setAiHistoryError] = useState("");

  useEffect(() => {
    if (!aiEnabled || !historyOpen) return;

    const closeHistory = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".ai-history-panel, .ai-history-button")
      ) {
        return;
      }
      setHistoryOpen(false);
    };
    window.addEventListener("pointerdown", closeHistory);
    return () => window.removeEventListener("pointerdown", closeHistory);
  }, [aiEnabled, historyOpen]);

  useEffect(() => {
    if (!aiEnabled || !historyOpen || !projectId) return;

    const controller = new AbortController();
    fetch(`/api/projects/${encodeURIComponent(projectId)}/ai-prompt-chats`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          chats?: AiPromptChat[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(
            result.error ?? "AI 프롬프트 내역을 불러오지 못했습니다.",
          );
        }
        setAiHistoryError("");
        setAiHistory(result.chats ?? []);
      })
      .catch((error) => {
        if (error instanceof Error && error.name !== "AbortError") {
          setAiHistoryError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAiHistoryLoading(false);
      });
    return () => controller.abort();
  }, [aiEnabled, historyOpen, projectId, aiHistoryVersion]);

  if (!aiEnabled) return null;

  return (
    <div className="ai-card">
      <div className="ai-title">
        <span className="ai-icon">
          <Icon name="sparkle" size={16} />
        </span>
        <strong>AI로 화면 만들기</strong>
        <button
          type="button"
          className="ai-history-button"
          title="AI 프롬프트 기록"
          aria-label="AI 프롬프트 기록 보기"
          aria-expanded={historyOpen}
          onClick={() => setHistoryOpen((current) => !current)}
        >
          <Icon name="history" size={15} />
        </button>
      </div>
      {historyOpen && (
        <div
          className="ai-history-panel"
          role="dialog"
          aria-label="AI 프롬프트 기록"
        >
          <div className="ai-history-head">
            <strong>프롬프트 기록</strong>
            <span>{aiHistory.length}</span>
          </div>
          <div className="ai-history-list">
            {projectId && aiHistoryLoading ? (
              <div className="ai-history-state">불러오는 중...</div>
            ) : aiHistoryError ? (
              <div className="ai-history-state error">{aiHistoryError}</div>
            ) : aiHistory.length === 0 ? (
              <div className="ai-history-state">아직 생성 내역이 없습니다.</div>
            ) : (
              aiHistory.map((chat) => (
                <article className="ai-history-item" key={chat.id}>
                  <p>{chat.prompt}</p>
                  <div>
                    <span>{chat.screenTitle || "AI 화면"}</span>
                    <span>{chat.model}</span>
                  </div>
                  <time dateTime={chat.createdAt ?? undefined}>
                    {chat.createdAt
                      ? new Date(chat.createdAt).toLocaleString("ko-KR")
                      : "방금 전"}
                  </time>
                </article>
              ))
            )}
          </div>
        </div>
      )}
      <textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key === "Enter" &&
            !readOnly &&
            !generating &&
            prompt.trim() &&
            model
          ) {
            event.preventDefault();
            onGenerate();
          }
        }}
        placeholder="예: 미니멀한 개인 홈페이지를 기획해줘"
        maxLength={2000}
        disabled={generating || readOnly}
      />
      <label className="ai-model-field">
        <span>사용 모델</span>
        <select
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          disabled={
            readOnly || generating || modelsLoading || models.length === 0
          }
        >
          {modelsLoading && models.length === 0 ? (
            <option value="">모델 불러오는 중...</option>
          ) : (
            models.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))
          )}
        </select>
      </label>
      <button
        onClick={onGenerate}
        disabled={readOnly || generating || !prompt.trim() || !model}
        aria-busy={generating}
      >
        {generating ? "화면 설계 중..." : "생성하기"}
        <span>Ctrl/⌘ ↵</span>
      </button>
      <p className={modelWarning ? "ai-model-warning" : undefined}>
        {modelWarning || "AI가 화면 구조와 콘텐츠를 자동으로 설계합니다."}
      </p>
    </div>
  );
}
