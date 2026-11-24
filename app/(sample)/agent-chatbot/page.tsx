"use client";

import React, { useEffect, useState, useRef } from "react";
import styles from "./agent-chatbot.module.css";

import { Maximize2, Minimize2 } from "lucide-react";

const AVAILABLE_TOOLS = [
  {
    id: "code_builder",
    name: "Code Builder",
    description: "코드 및 스크립트 작성",
  },
  {
    id: "db_builder",
    name: "Database Builder",
    description: "DB 스키마 및 쿼리 설계",
  },
  {
    id: "delete_user_data",
    name: "Delete User Data",
    description: "사용자 데이터 삭제",
  },
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ToolSelection {
  prompt: string;
  messages: unknown[];
  tools: { id: string; name: string; description: string }[];
  message: string;
}

type AgentEvent =
  | { type: "status" | "tool_start"; message: string }
  | { type: "tool_end"; tool: string; result: string }
  | ({ type: "hitl_tool_selection" } & ToolSelection)
  | { type: "token"; content: string }
  | { type: "error"; message: string }
  | { type: "done" };

interface AgentRequest {
  prompt: string;
  messages: unknown[];
  activeToolName?: string | null;
  hitlSelectedTool?: string;
}

export default function AgentChatPage() {
  const [input, setInput] = useState("");
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [selectedTool, setSelectedTool] = useState<
    (typeof AVAILABLE_TOOLS)[0] | null
  >(null);

  // 슬래시 커맨드 팝업 상태
  const [showPopup, setShowPopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Human-in-the-Loop (툴 선택 대기) 상태
  const [hitlData, setHitlData] = useState<ToolSelection | null>(null);

  // 실행 및 응답 상태
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusLogs, setStatusLogs] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const followConversationRef = useRef(true);
  const pendingAssistantIdRef = useRef<string | null>(null);
  const requestInFlightRef = useRef(false);
  const inputLineCount = input.split("\n").length;

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation && followConversationRef.current) {
      conversation.scrollTop = conversation.scrollHeight;
    }
  }, [messages, statusLogs, hitlData, requestError]);

  const filteredTools = AVAILABLE_TOOLS.filter(
    (tool) =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // 1. 슬래시(/) 커맨드 감지
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cursorPosition = e.target.selectionStart;
    setInput(val);
    if (!val.includes("\n")) setIsInputExpanded(false);

    const textBeforeCursor = val.slice(0, cursorPosition);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

    if (lastSlashIndex !== -1) {
      const query = textBeforeCursor.slice(lastSlashIndex + 1);
      if (/\s/.test(query)) {
        setShowPopup(false);
      } else {
        setShowPopup(true);
        setSearchQuery(query);
        setSelectedIndex(0);
      }
    } else {
      setShowPopup(false);
    }
  };

  const handleSelectTool = (tool: (typeof AVAILABLE_TOOLS)[0]) => {
    setSelectedTool(tool);
    setShowPopup(false);

    const cursorPosition = textareaRef.current?.selectionStart || input.length;
    const textBeforeCursor = input.slice(0, cursorPosition);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("/");

    if (lastSlashIndex !== -1) {
      const newInput =
        input.slice(0, lastSlashIndex) + input.slice(cursorPosition);
      setInput(newInput);
      if (!newInput.includes("\n")) setIsInputExpanded(false);
    }
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      setShowPopup(false);
      return;
    }

    if (showPopup) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredTools.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + filteredTools.length) % filteredTools.length,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredTools[selectedIndex]) {
          handleSelectTool(filteredTools[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        setShowPopup(false);
      }
      return;
    }

    if (e.key === "Escape" && isInputExpanded) {
      e.preventDefault();
      setIsInputExpanded(false);
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 답변은 요청마다 새 메시지에 누적하고, 도구 선택 후에는 같은 메시지에 이어 쓴다.
  const runAgent = async (payload: AgentRequest, assistantId: string) => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    setIsProcessing(true);
    setRequestError(null);
    let hasAnswerStarted = false;
    let waitingForTool = false;

    const handleEvent = (frame: string) => {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (!data) return;
      const event = JSON.parse(data) as AgentEvent;

      if (event.type === "status") {
        if (!hasAnswerStarted)
          setStatusLogs((prev) => [...prev, event.message]);
      } else if (event.type === "tool_start") {
        setStatusLogs([]);
      } else if (event.type === "tool_end") {
        if (!hasAnswerStarted) {
          setStatusLogs((prev) => [
            ...prev,
            "✅ [" + event.tool + "] 완료: " + event.result,
          ]);
        }
      } else if (event.type === "hitl_tool_selection") {
        setHitlData(event);
        waitingForTool = true;
      } else if (event.type === "token" && event.content) {
        if (!hasAnswerStarted) {
          hasAnswerStarted = true;
          setStatusLogs([]);
        }
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, content: message.content + event.content }
              : message,
          ),
        );
      } else if (event.type === "error") {
        throw new Error(event.message);
      }
    };

    try {
      const response = await fetch("/api/human-in-the-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new Error(
          "요청에 실패했습니다 (" + response.status + "). 다시 시도해주세요.",
        );
      if (!response.body) throw new Error("응답 스트림을 읽을 수 없습니다.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer = (buffer + decoder.decode(value, { stream: !done })).replace(
            /\r\n/g,
            "\n",
          );
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) !== -1) {
            handleEvent(buffer.slice(0, boundary));
            buffer = buffer.slice(boundary + 2);
            if (waitingForTool) break;
          }
          if (waitingForTool) {
            await reader.cancel();
            break;
          }
          if (done) {
            if (buffer.trim()) handleEvent(buffer);
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!hasAnswerStarted && !waitingForTool) {
        throw new Error("답변을 받지 못했습니다. 다시 시도해주세요.");
      }
    } catch (error) {
      setStatusLogs([]);
      setRequestError(
        error instanceof Error ? error.message : "답변을 불러오지 못했습니다.",
      );
      setMessages((prev) =>
        prev.filter((message) => message.id !== assistantId || message.content),
      );
    } finally {
      if (!waitingForTool) pendingAssistantIdRef.current = null;
      requestInFlightRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || requestInFlightRef.current || hitlData) return;

    const currentPrompt = input;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: currentPrompt,
    };
    const assistantId = crypto.randomUUID();
    const conversation = [
      ...messages.filter((message) => message.content),
      userMessage,
    ];

    pendingAssistantIdRef.current = assistantId;
    followConversationRef.current = true;
    setMessages([
      ...conversation,
      { id: assistantId, role: "assistant", content: "" },
    ]);
    setInput("");
    setIsInputExpanded(false);
    setShowPopup(false);
    setStatusLogs([]);

    void runAgent(
      {
        prompt: currentPrompt,
        activeToolName: selectedTool ? selectedTool.id : null,
        messages: conversation.map(({ role, content }) => ({ role, content })),
      },
      assistantId,
    );
  };

  const handleHitlToolSelect = (toolId: string) => {
    const assistantId = pendingAssistantIdRef.current;
    if (!hitlData || !assistantId || requestInFlightRef.current) return;
    setStatusLogs((prev) => [
      ...prev,
      "사용자가 [" + toolId + "] 툴을 선택했습니다.",
    ]);
    const currentHitl = hitlData;
    setHitlData(null);
    followConversationRef.current = true;

    void runAgent(
      {
        prompt: currentHitl.prompt,
        messages: currentHitl.messages,
        hitlSelectedTool: toolId,
      },
      assistantId,
    );
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h2 className="text-sm font-bold text-gray-900">
          Advanced Agent Chat with Slash & HITL
        </h2>

        {/* 선택된 활성 도구 배지 */}
        {selectedTool && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg w-fit text-sm text-blue-700">
            <span className="font-semibold">지정된 툴:</span> /
            {selectedTool.name}
            <button
              onClick={() => setSelectedTool(null)}
              className="ml-2 text-blue-400 hover:text-blue-700 font-bold"
            >
              ×
            </button>
          </div>
        )}
      </header>

      <div
        ref={conversationRef}
        className={styles.conversation}
        role="log"
        aria-label="채팅 대화"
        aria-live="polite"
        onScroll={(event) => {
          const element = event.currentTarget;
          followConversationRef.current =
            element.scrollHeight - element.clientHeight - element.scrollTop <
            80;
        }}
      >
        {messages.map((message) => (
          <article
            key={message.id}
            data-message-role={message.role}
            className={`${styles.message} ${message.role === "user" ? styles.userMessage : styles.assistantMessage}`}
          >
            <p className={styles.messageAuthor}>
              {message.role === "user" ? "나" : "AI"}
            </p>
            <div className={styles.messageContent}>
              {message.content || "답변 준비 중…"}
            </div>
          </article>
        ))}

        {/* 실행 로그 */}
        {statusLogs.length > 0 && (
          <div
            className={`${styles.activity} bg-gray-50 border rounded-xl p-4 space-y-2 text-sm text-gray-700`}
          >
            <p className="text-xs font-semibold text-gray-400 uppercase">
              Execution Logs
            </p>
            {statusLogs.map((log, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>{log}</span>
              </div>
            ))}
          </div>
        )}

        {/* [Human-in-the-Loop] 툴 선택 대기 레이어 박스 */}
        {hitlData && (
          <div
            className={`${styles.activity} bg-amber-50 border-2 border-amber-400 rounded-xl p-5 space-y-4 shadow-md`}
          >
            <p className="font-semibold text-amber-900">{hitlData.message}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {hitlData.tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleHitlToolSelect(t.id)}
                  className="bg-white border border-amber-300 p-3 rounded-xl text-left hover:bg-amber-100 transition-colors shadow-sm flex flex-col justify-between"
                >
                  <span className="font-bold text-amber-900 text-sm">
                    /{t.name}
                  </span>
                  <span className="text-xs text-gray-600 mt-1">
                    {t.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {requestError && (
          <p className={styles.error} role="alert">
            {requestError}
          </p>
        )}
      </div>

      {/* 입력 영역 (너비를 대폭 확장: max-w-4xl 컨테이너 안에서 가득 차도록 설정) */}
      <div
        className={`${styles.composer} ${isInputExpanded ? styles.expanded : ""}`}
      >
        <div
          className={`${styles.inputBox} relative border-2 rounded-2xl p-4 bg-white shadow-lg focus-within:border-blue-500`}
        >
          {inputLineCount >= 2 && (
            <div className={styles.inputToolbar}>
              <button
                type="button"
                className={styles.expandToggle}
                aria-label={isInputExpanded ? "입력창 접기" : "입력창 펼치기"}
                title={isInputExpanded ? "입력창 접기" : "입력창 펼치기"}
                aria-controls="agent-chatbot-input"
                aria-expanded={isInputExpanded}
                onClick={() => {
                  setIsInputExpanded((expanded) => !expanded);
                  textareaRef.current?.focus();
                }}
              >
                {isInputExpanded ? <Minimize2 /> : <Maximize2 />}
              </button>
            </div>
          )}
          <textarea
            id="agent-chatbot-input"
            aria-label="에이전트 메시지"
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isProcessing || hitlData !== null}
            placeholder="메시지를 입력하세요. 툴을 지정하려면 '/'를 입력하세요..."
            className={`${styles.textarea} w-full resize-none outline-none overflow-y-auto text-gray-800 text-base disabled:bg-transparent`}
            rows={Math.min(3, inputLineCount)}
          />

          {/* 슬래시 커맨드 레이어 창 */}
          {showPopup && filteredTools.length > 0 && (
            <div
              className={`${styles.toolMenu} absolute left-4 bottom-full mb-3 w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden z-30`}
            >
              <div className="bg-gray-100 px-4 py-2 text-xs font-bold text-gray-600 border-b">
                🛠️ 툴 선택 (↑↓ 이동, Enter로 선택)
              </div>
              <div className="max-h-52 overflow-y-auto p-1.5 space-y-1">
                {filteredTools.map((tool, index) => (
                  <div
                    key={tool.id}
                    onClick={() => handleSelectTool(tool)}
                    className={`px-3 py-2.5 rounded-xl cursor-pointer text-sm flex flex-col transition-colors ${
                      index === selectedIndex
                        ? "bg-blue-600 text-white"
                        : "hover:bg-gray-100 text-gray-800"
                    }`}
                  >
                    <span className="font-semibold">/{tool.name}</span>
                    <span
                      className={`text-xs mt-0.5 ${index === selectedIndex ? "text-blue-100" : "text-gray-500"}`}
                    >
                      {tool.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.sendActions}>
          <button
            onClick={handleSubmit}
            disabled={isProcessing || hitlData !== null || !input.trim()}
            className={`${styles.sendButton} bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md`}
          >
            {isProcessing ? "에이전트 실행 중..." : "전송하기"}
          </button>
        </div>
      </div>
    </main>
  );
}
