import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 사람이 승인해야 하는 민감한 도구 정의
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'delete_user_data',
      description: '특정 사용자의 데이터를 시스템에서 영구 삭제합니다. (주의: 관리자 승인 필요)',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: '삭제할 사용자 ID' },
        },
        required: ['userId'],
      },
    },
  },
];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, approved, previousToolCall, messages: prevMessages } = body;
  
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, payload: any) => {
        const data = JSON.stringify({ type, ...payload });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = prevMessages || [
          { 
            role: 'system', 
            content: '너는 시스템 관리 에이전트다. 사용자가 데이터 삭제를 요청하면 반드시 delete_user_data 도구를 호출해야 한다. 임의로 말로만 거절하거나 설명하지 마라.' 
          },
          { role: 'user', content: prompt },
        ];

        // 만약 이전 요청에서 프론트엔드가 승인(approved)을 해서 들어온 경우
        if (approved && previousToolCall) {
          sendEvent('status', { message: '사용자 승인 완료. 도구를 실행합니다...' });

          // 1. 승인되었으므로 도구 실행 결과 추가
          messages.push({
            role: 'assistant',
            tool_calls: [previousToolCall],
          });

          const toolResult = await executeDangerousTask(JSON.parse(previousToolCall.function.arguments).userId);

          messages.push({
            tool_call_id: previousToolCall.id,
            role: 'tool',
            content: toolResult,
          });

          // 2. 최종 답변 스트리밍 시작
          sendEvent('status', { message: '작업 완료 후 최종 답변 생성 중...' });
          const streamResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            stream: true,
          });

          for await (const chunk of streamResponse) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) sendEvent('token', { content: text });
          }

          sendEvent('done', {});
          controller.close();
          return;
        }

        // 최초 질문 접수 시 LLM 호출
        sendEvent('status', { message: 'AI가 요청을 분석 중입니다...' });
        const initialResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages,
          tools,
          // [핵심] 사용자가 뭐라고 쓰든 무조건 이 도구를 쓰도록 강제
          // tool_choice: { type: 'function', function: { name: 'delete_user_data' } },
          tool_choice: "auto",
        });
        console.log("LLM 응답 메시지:", JSON.stringify(initialResponse.choices[0].message, null, 2));

        const responseMessage = initialResponse.choices[0].message;

        if (responseMessage.tool_calls) {
          const toolCall = responseMessage.tool_calls[0];
          if (toolCall.type === 'function') {
            messages.push(responseMessage);
            const functionArgs = JSON.parse(toolCall.function.arguments);

            // [핵심] 민감한 도구 감지 시, 서버 실행을 멈추고 클라이언트에 승인 요구 (HITL)
            sendEvent('hitl_request', {
              tool: toolCall.function.name,
              args: functionArgs,
              toolCall: toolCall, // 나중에 그대로 돌려받을 객체
              messages: messages, // 현재까지의 대화 상태 보존
              message: `⚠️ [보안 승인 필요] '${toolCall.function.name}' 도구를 실행하려고 합니다. 승인하시겠습니까?`,
            });

            controller.close(); // 연결 종료 (사용자 응답 대기)
            return;
          }
        }

        // 도구를 안 쓰는 일반 대화인 경우 바로 스트리밍
        messages.push(responseMessage);
        const text = responseMessage.content || '';
        for (const char of text) {
          sendEvent('token', { content: char });
        }

        sendEvent('done', {});
        controller.close();
      } catch (error: any) {
        sendEvent('error', { message: error.message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

async function executeDangerousTask(userId: string): Promise<string> {
  return `성공: 사용자(${userId})의 데이터가 영구 삭제되었습니다.`;
}