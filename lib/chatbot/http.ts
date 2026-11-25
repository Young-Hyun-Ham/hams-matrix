import "server-only";
import { HttpError } from "@/lib/auth";
export const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export function error(error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  return json(
    {
      code: `CHATBOT_${status}`,
      message:
        error instanceof HttpError
          ? error.message
          : "챗봇 요청을 처리하지 못했습니다.",
    },
    status,
  );
}
export async function body(req: Request, max = 12000000) {
  if (Number(req.headers.get("content-length")) > max)
    throw new HttpError(413, "요청 크기를 초과했습니다.");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(400, "요청 내용이 없습니다.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new HttpError(413, "요청 크기를 초과했습니다.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON 형식을 확인해 주세요.");
  }
}
