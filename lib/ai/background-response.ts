import "server-only";
import { HttpError } from "../auth";
import {
  GenerationCancelled,
  GenerationStopFailed,
} from "./generation-control";
import type { AiCallEvent } from "./token-types";

export const activeResponse = (status: unknown) =>
  status === "queued" || status === "in_progress";
export async function retrieveResponse(id: string, cancel = false) {
  const response = await fetch(
    `https://api.openai.com/v1/responses/${encodeURIComponent(id)}${cancel ? "/cancel" : ""}`,
    {
      method: cancel ? "POST" : "GET",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    },
  );
  if (!response.ok)
    throw new HttpError(
      502,
      cancel
        ? "AI 서버의 중지 확인에 실패했습니다. 다시 중지해 주세요."
        : "AI 진행 상태를 조회하지 못했습니다.",
    );
  return (await response.json()) as Record<string, unknown>;
}
export async function finishBackgroundResponse(
  initial: Record<string, unknown>,
  turn: number,
  started: number,
  deadline: number,
  track: ((event: AiCallEvent) => Promise<void>) | undefined,
  checkpoint: (() => Promise<void>) | undefined,
) {
  let current = initial;
  const id = typeof initial.id === "string" ? initial.id : undefined;
  const snapshot = async () =>
    track?.({
      turn,
      status: typeof current.status === "string" ? current.status : "unknown",
      responseId: id,
      model: typeof current.model === "string" ? current.model : undefined,
      usage: current.usage,
      durationMs: Date.now() - started,
      httpStatus: 200,
    });
  try {
    await snapshot();
    while (activeResponse(current.status)) {
      if (!id) throw new HttpError(502, "AI 응답 ID가 없습니다.");
      await checkpoint?.();
      if (Date.now() >= deadline)
        throw new HttpError(504, "AI 생성 시간이 초과되었습니다.");
      await new Promise((resolve) => setTimeout(resolve, 500));
      await checkpoint?.();
      current = await retrieveResponse(id);
      await snapshot();
    }
    await checkpoint?.();
    if (current.status === "cancelled") throw new GenerationCancelled();
    return current;
  } catch (error) {
    // Keep the response ID until cancellation is confirmed; aborting creation could orphan a paid job.
    if (id && activeResponse(current.status)) {
      try {
        current = await retrieveResponse(id, true);
        await snapshot();
        if (activeResponse(current.status)) throw new GenerationStopFailed();
      } catch {
        throw new GenerationStopFailed();
      }
    }
    throw error;
  }
}
