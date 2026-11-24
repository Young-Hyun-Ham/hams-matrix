"use client";

import { useState } from "react";

export default function HitlChatPage() {
  const [input, setInput] = useState(`사용자 ID 'user_123' 데이터를 삭제해줘`);
  const [inputText, setInputText] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");

  // Human-in-the-Loop 대기 상태 관리용
  const [hitlData, setHitlData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 공통 API 호출 함수 (최초 요청 및 승인 후 재개용)
  const runAgent = async (payload: object) => {
    setIsProcessing(true);
    setAnswer("");
    try {
      // Fetch 기반 ReadableStream 방식
      // 브라우저의 기본 fetch API를 POST 메서드로 호출하고, 서버가 내려주는 ReadableStream을 바이트 단위로 직접 읽어서 파싱하는 방식
      const response = await fetch("/api/agent-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const event = JSON.parse(line.replace("data: ", ""));

            if (event.type === "status") {
              setLogs((prev) => [...prev, event.message]);
            } else if (event.type === "hitl_request") {
              // 멈춰 서서 사용자 승인 대기
              setHitlData(event);
              setIsProcessing(false);
              return;
            } else if (event.type === "token") {
              setAnswer((prev) => prev + event.content);
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    setLogs([]);
    setHitlData(null);
    runAgent({ prompt: input });
    setInputText(input);
    setInput("");
  };

  // 사용자가 [승인] 버튼을 눌렀을 때
  const handleApprove = () => {
    if (!hitlData) return;
    setLogs((prev) => [...prev, "사용자가 실행을 승인했습니다."]);
    const currentHitl = hitlData;
    setHitlData(null);

    // 중단되었던 상태와 toolCall 정보를 담아 다시 API 요청
    runAgent({
      approved: true,
      previousToolCall: currentHitl.toolCall,
      messages: currentHitl.messages,
    });
  };

  // 사용자가 [거절] 버튼을 눌렀을 때
  const handleReject = () => {
    setHitlData(null);
    setLogs((prev) => [...prev, "사용자가 작업을 거절했습니다."]);
    setAnswer("요청하신 작업이 사용자에 의해 취소되었습니다.");
    setIsProcessing(false);
  };

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h2 className="text-xl font-bold">Agent with Human-in-the-Loop (HITL)</h2>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: 사용자 ID 'user_123' 데이터를 삭제해줘"
          className="flex-1 border rounded-lg px-4 py-2"
          disabled={isProcessing || hitlData !== null}
        />
        <button
          type="submit"
          disabled={isProcessing || hitlData !== null}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg disabled:opacity-50"
        >
          실행
        </button>
      </form>

      {/* 1. 로그 상태 출력 */}
      {logs.length > 0 && (
        <div className="bg-gray-50 border rounded-xl p-4 text-sm space-y-1 text-gray-700">
          <p>{inputText}</p>
          {logs.map((log, i) => (
            <div key={i}>• {log}</div>
          ))}
        </div>
      )}

      {/* 2. [HITL 승인 박스] 사용자 개입이 필요한 경우에만 렌더링 */}
      {hitlData && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-5 space-y-3">
          <p className="font-semibold text-amber-900">{hitlData.message}</p>
          <div className="text-xs bg-amber-100 p-2 rounded text-amber-800 font-mono">
            대상 도구: {hitlData.tool} <br />
            전달 인자: {JSON.stringify(hitlData.args)}
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleApprove}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
            >
              승인 (Approve)
            </button>
            <button
              onClick={handleReject}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
            >
              거절 (Reject)
            </button>
          </div>
        </div>
      )}

      {/* 3. 최종 답변 영역 */}
      {answer && (
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-blue-600 mb-2">
            Final Output
          </p>
          <div className="text-gray-900 whitespace-pre-wrap">{answer}</div>
        </div>
      )}
    </div>
  );
}
