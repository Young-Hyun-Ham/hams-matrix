import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// OpenAI 클라이언트 초기화 (환경 변수 OPENAI_API_KEY 사용)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // 1. OpenAI Chat Completion API 호출 (stream: true 설정)
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // 또는 gpt-4o 등 사용하려는 모델
      messages: [{ role: 'user', content: prompt }],
      stream: true, // 핵심: 스트리밍 활성화
    });

    // 2. OpenAI 스트림을 브라우저가 읽을 수 있는 ReadableStream으로 변환
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of response) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              // 텍스트 조각을 인코딩해서 클라이언트로 전송
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });

    // 3. 스트림 응답 반환 (Text/Event-Stream 혹은 일반 Raw Stream)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}