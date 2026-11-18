import { NextRequest } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 시스템에 등록된 전체 툴 목록
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'code_builder',
      description: '코드 컴포넌트나 스크립트를 작성합니다.',
      parameters: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_builder',
      description: '데이터베이스 스키마 및 쿼리를 설계합니다.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_user_data',
      description: '특정 사용자의 데이터를 시스템에서 영구 삭제합니다. (관리자 승인 필요)',
      parameters: { type: 'object', properties: { userId: { type: 'string' } }, required: ['userId'] },
    },
  },
];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, activeToolName, hitlSelectedTool, messages: prevMessages } = body;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, payload: any) => {
        const data = JSON.stringify({ type, ...payload });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      try {
        let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = prevMessages || [
          { role: 'user', content: prompt },
        ];

        // [케이스 B] Human-in-the-Loop 또는 슬래시 커맨드로 툴이 최종 선택되어 재개된 경우
        if (hitlSelectedTool) {
          sendEvent('status', { message: `선택된 툴 [${hitlSelectedTool}]을(를) 실행합니다...` });

          // 강제로 해당 툴을 호출하는 assistant message와 tool_call 구조 생성
          const forcedToolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall = {
            id: `call_${Date.now()}`,
            type: 'function',
            function: {
              name: hitlSelectedTool,
              arguments: JSON.stringify({ prompt: prompt, query: prompt, userId: prompt }),
            },
          };

          messages.push({
            role: 'assistant',
            tool_calls: [forcedToolCall],
          });

          // 가상의 툴 실행
          await new Promise((r) => setTimeout(r, 1000));
          const toolResult = `성공: ${hitlSelectedTool} 작업이 정상적으로 수행되었습니다.`;

          sendEvent('tool_end', { tool: hitlSelectedTool, result: toolResult });

          messages.push({
            tool_call_id: forcedToolCall.id,
            role: 'tool',
            content: toolResult,
          });

          // 최종 스트리밍 답변 생성
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

        // [케이스 A] 최초 실행 (슬래시 커맨드로 특정 툴이 지정되었거나 auto인 경우)
        let toolChoiceOption: any = 'auto';
        if (activeToolName) {
          toolChoiceOption = { type: 'function', function: { name: activeToolName } };
        }

        sendEvent('status', { message: 'AI가 요청을 분석 중입니다...' });
        const initialResponse = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages,
          tools,
          tool_choice: toolChoiceOption,
        });

        const responseMessage = initialResponse.choices[0].message;

        // 1. AI가 스스로 툴을 골랐거나 슬래시 커맨드로 강제된 경우
        if (responseMessage.tool_calls) {
          messages.push(responseMessage);
          const toolCall = responseMessage.tool_calls[0];
          if (toolCall.type === 'function') {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);

            sendEvent('tool_start', { tool: functionName, message: `${functionName} 툴 실행 중...` });
            await new Promise((r) => setTimeout(r, 1000));
            const toolResult = `성공: ${functionName} 처리 완료`;

            sendEvent('tool_end', { tool: functionName, result: toolResult });
            messages.push({ tool_call_id: toolCall.id, role: 'tool', content: toolResult });

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
        }

        // 2. [Human-in-the-Loop] auto로 돌렸는데 툴을 안 쓰고 일반 대답을 한 경우 -> 툴 목록을 띄우도록 HITL 이벤트 송출
        if (!activeToolName) {
          sendEvent('hitl_tool_selection', {
            messages: messages,
            prompt: prompt,
            tools: tools.map((t: any) => ({ 
              id: t.function.name, 
              name: t.function.name, 
              description: t.function.description 
            })),
            message: '🤖 AI가 어떤 툴을 써야 할지 결정하지 못했습니다. 사용할 툴을 선택해주세요.',
          });
          controller.close();
          return;
        }

        // 일반 텍스트 응답 스트리밍
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