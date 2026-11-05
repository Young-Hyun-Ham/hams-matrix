import { HttpError } from "@/lib/auth";
export async function requestBytes(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max)
    throw new HttpError(413, "요청 크기 제한을 초과했습니다.");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new HttpError(413, "요청 크기 제한을 초과했습니다.");
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}
