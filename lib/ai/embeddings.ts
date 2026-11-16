import "server-only";
import { HttpError } from "../auth";
import type { AiCallEvent } from "./token-types";
import { vectorBytes } from "./rag-chunks";
export function embeddingModel(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^text-embedding[a-zA-Z0-9._-]*$/.test(value) ||
    value.length > 150
  )
    throw new HttpError(400, "임베딩 모델을 선택해 주세요.");
  return value;
}
export async function embeddingModels(key: string, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError(504, "임베딩 모델 조회 시간이 초과되었습니다.");
  }
  if (!response.ok)
    throw new HttpError(
      response.status === 401 || response.status === 403 ? 400 : 503,
      "API 키 또는 임베딩 모델 접근 권한을 확인해 주세요.",
    );
  const data = await response.json();
  const models: string[] = (Array.isArray(data.data) ? data.data : [])
    .map((m: { id: string }) => m.id)
    .filter(
      (id: unknown) =>
        typeof id === "string" && /^text-embedding[a-zA-Z0-9._-]*$/.test(id),
    )
    .sort();
  if (!models.length)
    throw new HttpError(400, "이 키로 사용할 수 있는 임베딩 모델이 없습니다.");
  return [...new Set(models)];
}
export async function embedTexts(options: {
  key: string;
  model: string;
  texts: string[];
  dimensions?: number;
  signal?: AbortSignal;
  checkpoint: () => Promise<void>;
  track: (event: AiCallEvent) => Promise<void>;
  turn: number;
  purpose: "embedding_query" | "embedding_index";
}) {
  const { texts, track, turn, model, purpose } = options;
  embeddingModel(model);
  if (
    !texts.length ||
    texts.length > 64 ||
    texts.some((t) => !t.trim() || Buffer.byteLength(t, "utf8") > 8000)
  )
    throw new HttpError(400, "임베딩 입력 크기를 확인해 주세요.");
  const started = Date.now();
  await options.checkpoint();
  await track({
    turn,
    purpose,
    model,
    status: "started",
    reservedTokens: texts.reduce((n, t) => n + Buffer.byteLength(t, "utf8"), 0),
  });
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(30000);
    response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: texts,
        encoding_format: "float",
        ...(options.dimensions && /^text-embedding-3/.test(model)
          ? { dimensions: options.dimensions }
          : {}),
      }),
      signal: options.signal
        ? AbortSignal.any([options.signal, timeout])
        : timeout,
    });
  } catch {
    await track({
      turn,
      purpose,
      model,
      status: "unknown",
      durationMs: Date.now() - started,
    });
    throw new HttpError(504, "임베딩 호출 결과를 확인하지 못했습니다.");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  const usage = data.usage;
  const validUsage =
    usage &&
    Number.isSafeInteger(usage.prompt_tokens) &&
    usage.prompt_tokens >= 0 &&
    usage.total_tokens === usage.prompt_tokens;
  await track({
    turn,
    purpose,
    model,
    status: response.ok ? "completed" : "failed",
    httpStatus: response.status,
    durationMs: Date.now() - started,
    usage: validUsage
      ? {
          input_tokens: usage.prompt_tokens,
          output_tokens: 0,
          total_tokens: usage.total_tokens,
        }
      : undefined,
  });
  if (!response.ok)
    throw new HttpError(
      response.status === 429 ? 429 : response.status >= 500 ? 503 : 400,
      "임베딩 API 키·사용 한도·모델 접근 권한을 확인해 주세요.",
    );
  if (
    data.model !== model ||
    !Array.isArray(data.data) ||
    data.data.length !== texts.length
  )
    throw new HttpError(502, "임베딩 응답 형식이 올바르지 않습니다.");
  const indexed = new Map<number, number[]>();
  try {
    for (const item of data.data) {
      if (
        !Number.isSafeInteger(item.index) ||
        item.index < 0 ||
        item.index >= texts.length ||
        indexed.has(item.index) ||
        !Array.isArray(item.embedding)
      )
        throw Error();
      vectorBytes(item.embedding);
      indexed.set(item.index, item.embedding);
    }
    const vectors = texts.map((_, i) => indexed.get(i)!);
    const dimensions = options.dimensions || vectors[0].length;
    if (vectors.some((v) => v.length !== dimensions)) throw Error();
    await options.checkpoint();
    return vectors;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "임베딩 벡터 개수 또는 차원이 일치하지 않습니다.");
  }
}
