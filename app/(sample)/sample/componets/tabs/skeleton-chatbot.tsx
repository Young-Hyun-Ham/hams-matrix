"use client";

import { useState } from "react";
import ChatMessage from "../ChatMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function SkeletonChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  // 상태 관리 핵심 플래그
  const [isLoading, setIsLoading] = useState(false); // 생각 중 (첫 토큰 대기)
  const [isStreaming, setIsStreaming] = useState(false); // 스트리밍 진행 중

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isStreaming) return;

    const userMessageText = input;
    setInput("");

    // 1. 유저 메시지 추가
    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessageText,
    };

    // 2. 빈 어시스턴트 메시지 슬롯 미리 생성
    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    // 3. 네트워크 요청 전 '생각 중' 상태 진입
    setIsLoading(true);

    try {
      const response = await fetch("/api/sample/chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessageText }),
      });
      // 예시: 2초 지연
      await new Promise((resolve) => setTimeout(resolve, 3000));

      if (!response.body) throw new Error("ReadableStream not supported.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedContent = "";

      let isFirstChunk = true;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedContent += chunk;

        // 첫 번째 청크가 들어오는 순간 '생각 중'을 끄고 '스트리밍 중'으로 전환
        if (isFirstChunk) {
          setIsLoading(false);
          setIsStreaming(true);
          isFirstChunk = false;
        }

        // 실시간으로 메시지 상태 업데이트
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: accumulatedContent }
              : msg,
          ),
        );
      }
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      // 모든 과정 종료
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full max-w-2xl mx-auto flex-col p-4">
      {/* 메시지 리스트 영역 */}
      <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-2">
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          return (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              // 마지막 어시스턴트 메시지에만 현재 로딩/스트리밍 상태 적용
              isLoading={isLastMessage && msg.role === "assistant" && isLoading}
              isStreaming={
                isLastMessage && msg.role === "assistant" && isStreaming
              }
            />
          );
        })}
      </div>

      {/* 입력 폼 */}
      <form onSubmit={handleSubmit} className="mt-4 flex shrink-0 gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요..."
          className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isLoading || isStreaming}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </div>
  );
}
