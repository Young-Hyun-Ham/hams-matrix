import { useState } from 'react';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean; // 현재 스트리밍이 진행 중인지 여부
  isLoading?: boolean;   // 아직 첫 토큰도 안 와서 '생각 중'인지 여부
}

export default function ChatMessage({ role, content, isStreaming, isLoading }: MessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-none'
            : 'bg-gray-100 text-gray-900 rounded-bl-none border border-gray-200'
        }`}
      >
        {/* 1. 아직 첫 토큰도 안 온 '생각 중' 상태 */}
        {isLoading && !content ? (
          <div className="flex items-center space-x-2 py-1 text-gray-500 animate-pulse">
            <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
            <span className="ml-1 text-xs font-medium">생각 중...</span>
          </div>
        ) : (
          /* 2. 실제 답변 텍스트 + 스트리밍 깜박이 커서 */
          <div className="whitespace-pre-wrap">
            {content}
            {isStreaming && (
              <span className="inline-block w-1.5 h-4 ml-1 bg-blue-500 align-middle animate-pulse" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}