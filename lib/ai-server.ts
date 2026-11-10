import "server-only";
import { HttpError } from "./auth";
import type { AiCallEvent } from "./ai/token-types";
import { finishBackgroundResponse } from "./ai/background-response";
import { MAX_GUARDRAIL_CHANGES } from "./ai/guardrail-types";
import { MAX_TOOL_ROUNDS } from "./ai/guardrail-types";
import { createHash } from "node:crypto";

export async function aiModels() {
  if (!process.env.OPENAI_API_KEY)
    throw new HttpError(503, "AI API 키가 설정되지 않았습니다.");
  const configured = process.env.OPENAI_MODELS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured?.length) return configured;
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error();
    const data = (await response.json()) as { data?: { id: string }[] };
    const models = (data.data ?? [])
      .map((m) => m.id)
      .filter(
        (id) =>
          /^gpt-(?:[5-9]|[1-9]\d|4\.1|4o)/.test(id) &&
          !/(audio|realtime|transcrib|tts|image|search|instruct|computer|chat-latest)/.test(
            id,
          ),
      )
      .sort();
    if (!models.length) throw new Error();
    return models;
  } catch {
    throw new HttpError(
      503,
      "AI 모델을 불러오지 못했습니다. API 키와 모델 접근 권한을 확인해 주세요.",
    );
  }
}
export async function generateAi(
  model: string,
  instructions: string,
  input: string,
  agent?: {
    tools: Record<string, unknown>[];
    execute: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  },
  images: { dataUrl: string }[] = [],
  history: Record<string, unknown>[] = [],
  track?: (event: AiCallEvent) => Promise<void>,
  checkpoint?: () => Promise<void>,
  options?: {
    responseFormat?: Record<string, unknown>;
    deadline?: number;
    maxOutputTokens?: number;
    maxToolRounds?: number;
    requestId?: string;
  },
) {
  const maxOutputTokens = Math.min(
    16000,
    Math.max(1, Math.floor(options?.maxOutputTokens ?? 6000)),
  );
  const messages: Record<string, unknown>[] = [
    ...history,
    {
      role: "user",
      content: images.length
        ? [
            { type: "input_text", text: input },
            ...images.map((image) => ({
              type: "input_image",
              image_url: image.dataUrl,
              detail: "auto",
            })),
          ]
        : input,
    },
  ];
  const deadline = Math.min(Date.now() + 120000, options?.deadline ?? Infinity);
  const maxRounds = options?.maxToolRounds ?? 12;
  if (
    !Number.isInteger(maxRounds) ||
    maxRounds < 2 ||
    maxRounds > MAX_TOOL_ROUNDS
  )
    throw new HttpError(400, `AI 실행 단계는 2~${MAX_TOOL_ROUNDS}회입니다.`);
  let previousFailure = "",
    failureCount = 0,
    previousRead = "",
    readCount = 0,
    lastError = "";
  const failure = (reason: string): never => {
    throw new HttpError(
      502,
      `${reason}${lastError ? ` 마지막 도구 오류: ${lastError}` : ""} 이 요청의 변경안은 저장되지 않았습니다.`,
    );
  };
  for (let turn = 0; turn < maxRounds; turn++) {
    await checkpoint?.();
    if (Date.now() >= deadline)
      failure(
        "AI 전체 처리 시간 제한에 도달했습니다. 처리 범위를 줄여 주세요.",
      );
    const finalRound = turn === maxRounds - 1;
    const batchGuidance = agent?.tools.some(
      (tool) => tool.name === "save_database_tables",
    )
      ? "여러 DB 테이블 신규 등록은 save_database_tables로 묶어서 요청하세요. 내용이 길면 5~10개씩 나누고 남은 단계와 변경 건수를 확인하세요."
      : "허용된 도구만 사용하고 완료한 작업은 반복하지 마세요.";
    const roundInstructions = agent
      ? `${instructions}\n[실행 예산] 최종 답변 포함 ${maxRounds}단계 중 ${turn + 1}단계. 남은 단계 ${maxRounds - turn - 1}. ${finalRound ? "도구 사용을 종료하고 검증된 변경안·오류·남은 작업을 최종 설명하세요. 저장 완료를 주장하지 마세요." : `${batchGuidance} pending 변경안의 저장 확인 조회를 반복하지 마세요.`}`
      : instructions;
    const started = Date.now();
    // UTF-8 bytes conservatively bound text tokenization; reserve image budget separately.
    const budgetText = JSON.stringify(
      {
        instructions: roundInstructions,
        tools: agent?.tools,
        messages,
        responseFormat: options?.responseFormat,
      },
      (key, value) =>
        key === "image_url" && typeof value === "string" ? "[image]" : value,
    );
    const imageCount = (
      JSON.stringify(messages).match(/"type":"input_image"/g) ?? []
    ).length;
    await track?.({
      turn,
      status: "started",
      reservedTokens:
        Buffer.byteLength(budgetText, "utf8") +
        maxOutputTokens +
        4096 +
        imageCount * 65536,
    });
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: roundInstructions,
          input: agent || images.length || history.length ? messages : input,
          store: false,
          background: true,
          max_output_tokens: maxOutputTokens,
          ...(options?.responseFormat
            ? { text: { format: options.responseFormat } }
            : {}),
          ...(agent
            ? {
                tools: agent.tools,
                parallel_tool_calls: false,
                ...(finalRound ? { tool_choice: "none" } : {}),
                include: ["reasoning.encrypted_content"],
              }
            : {}),
        }),
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      });
    } catch {
      await track?.({
        turn,
        status: "failed",
        durationMs: Date.now() - started,
      });
      throw new HttpError(
        504,
        "AI 응답을 기다리지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      await track?.({
        turn,
        status: "invalid_response",
        httpStatus: response.status,
        durationMs: Date.now() - started,
      });
      throw new HttpError(
        502,
        "AI 응답을 해석하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
    let metadata =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    if (response.ok)
      metadata = await finishBackgroundResponse(
        metadata,
        turn,
        started,
        deadline,
        track,
        checkpoint,
      );
    await track?.({
      turn,
      status: response.ok
        ? typeof metadata.status === "string"
          ? metadata.status.slice(0, 80)
          : "unknown"
        : "failed",
      httpStatus: response.status,
      responseId:
        typeof metadata.id === "string" ? metadata.id.slice(0, 200) : undefined,
      model:
        typeof metadata.model === "string"
          ? metadata.model.slice(0, 200)
          : model,
      usage: metadata.usage,
      durationMs: Date.now() - started,
    });
    if (!response.ok)
      throw new HttpError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? "AI 사용 한도 또는 요청 한도를 확인해 주세요."
          : "AI 요청에 실패했습니다. 선택한 모델의 Responses API 지원 및 API 키 권한을 확인해 주세요.",
      );
    const data = metadata as {
      status?: string;
      output?: (Record<string, unknown> & {
        type: string;
        call_id?: string;
        name?: string;
        arguments?: string;
        content?: { type: string; text?: string }[];
      })[];
    };
    if (data.status !== "completed")
      throw new HttpError(
        502,
        "AI 응답이 완성되지 않았습니다. 요청 범위를 줄여 다시 시도해 주세요.",
      );
    const output = data.output ?? [],
      calls = output.filter((item) => item.type === "function_call");
    if (calls.length) {
      if (finalRound)
        failure(
          `AI 실행 ${maxRounds}단계 한도에서 최종 답변을 만들지 못했습니다.`,
        );
      // Allow a full change batch plus read_page; the agent enforces the active change limit.
      if (!agent || calls.length > MAX_GUARDRAIL_CHANGES + 1)
        throw new HttpError(502, "허용된 도구 호출 수를 초과했습니다.");
      messages.push(...output);
      for (const call of calls) {
        await checkpoint?.();
        if (!call.call_id || !call.name || !call.arguments)
          throw new HttpError(502, "AI 도구 요청 형식이 올바르지 않습니다.");
        let args: Record<string, unknown>;
        try {
          const value = JSON.parse(call.arguments);
          if (!value || typeof value !== "object" || Array.isArray(value))
            throw new Error();
          args = value;
        } catch {
          throw new HttpError(502, "AI 도구 입력을 해석하지 못했습니다.");
        }
        const toolStarted = Date.now();
        const result = await agent.execute(call.name, args);
        const record =
          result && typeof result === "object"
            ? (result as Record<string, unknown>)
            : {};
        const toolName = agent.tools.some((tool) => tool.name === call.name)
          ? call.name
          : "unknown";
        console.info(
          "[ai-tool]",
          JSON.stringify({
            requestId: options?.requestId,
            turn: turn + 1,
            maxRounds,
            tool: toolName,
            durationMs: Date.now() - toolStarted,
            success: record.success !== false,
            status:
              typeof record.status === "number" ? record.status : undefined,
            pendingCount:
              typeof record.pendingCount === "number"
                ? record.pendingCount
                : undefined,
          }),
        );
        if (record.success === false) {
          lastError =
            typeof record.error === "string"
              ? record.error.slice(0, 240)
              : "도구 실행 실패";
          const signature = `${call.name}:${record.status}:${lastError}`;
          failureCount = signature === previousFailure ? failureCount + 1 : 1;
          previousFailure = signature;
          if (failureCount >= 3)
            failure("동일한 도구 오류가 3회 반복되어 중단했습니다.");
        } else if (call.name !== "read_page") {
          previousFailure = "";
          failureCount = 0;
          lastError = "";
        }
        if (call.name === "read_page" && record.success !== false) {
          const signature = createHash("sha256")
            .update(JSON.stringify(result))
            .digest("hex");
          readCount = signature === previousRead ? readCount + 1 : 1;
          previousRead = signature;
          if (readCount >= 3)
            failure("변경 없는 동일 자료 조회가 3회 반복되어 중단했습니다.");
        } else if (record.success !== false) {
          previousRead = "";
          readCount = 0;
        }
        await checkpoint?.();
        messages.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
      }
      continue;
    }
    const result = output
      .flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();
    if (!result) throw new HttpError(502, "AI가 결과를 반환하지 못했습니다.");
    return lastError
      ? `${result}\n\n[서버 확인 도구 오류] ${lastError}\n실패한 도구 작업은 변경안에 포함되지 않았습니다.`
      : result;
  }
  throw new HttpError(
    502,
    `AI 실행 ${maxRounds}단계 한도를 초과했습니다. 이 요청의 변경안은 저장되지 않았습니다.${lastError ? ` 마지막 도구 오류: ${lastError}` : ""}`,
  );
}
