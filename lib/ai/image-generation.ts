import "server-only";
import { HttpError } from "../auth";

export function isImageModel(id: string) {
  return (/^gpt-image-[a-z0-9][a-z0-9.-]*$/.test(id) && id !== "gpt-image-1" && !/^gpt-image-1-\d/.test(id)) || id === "chatgpt-image-latest";
}

export async function imageModels() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new HttpError(503, "AI API 키가 설정되지 않았습니다.");
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error();
    const data = await response.json() as { data?: { id: string }[] };
    const configured = process.env.OPENAI_IMAGE_MODELS?.split(",").map((id) => id.trim()).filter(Boolean);
    const models = [...new Set((data.data ?? []).map((model) => model.id).filter((id) =>
      typeof id === "string" && isImageModel(id) && (!configured?.length || configured.includes(id)),
    ))].sort();
    if (!models.length) throw new HttpError(503, "사용 가능한 이미지 생성 모델이 없습니다. API 키의 모델 접근 권한을 확인해 주세요.");
    const preferred = process.env.OPENAI_IMAGE_MODEL;
    return { models, defaultModel: preferred && models.includes(preferred) ? preferred : models.includes("gpt-image-2.5-sunburst") ? "gpt-image-2.5-sunburst" : models[0] };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "이미지 모델을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export function generatedPng(base64: unknown) {
  const maxBytes = 8 * 1024 * 1024;
  if (typeof base64 !== "string" || base64.length > 4 * Math.ceil(maxBytes / 3) || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw new HttpError(502, "AI가 유효한 PNG 이미지를 반환하지 않았습니다. (최대 8MB)");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 57 || bytes.length > maxBytes || bytes.toString("base64") !== base64 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR")
    throw new HttpError(502, "AI 이미지 형식이 올바르지 않습니다.");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 4096 || height > 4096) throw new HttpError(502, "AI 이미지 크기가 올바르지 않습니다.");
  let position = 8, pixels = false, ended = false;
  while (position + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(position), type = bytes.toString("ascii", position + 4, position + 8);
    if (position + length + 12 > bytes.length) break;
    if (type === "IDAT") pixels = true;
    if (type === "IEND") { ended = length === 0 && position + 12 === bytes.length; break; }
    position += length + 12;
  }
  if (!pixels || !ended) throw new HttpError(502, "AI가 손상된 이미지를 반환했습니다.");
  return { bytes, width, height };
}

export async function generateAiPng(model: string, prompt: string, wide = false) {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, n: 1, size: wide && /^gpt-image-[2-9]/.test(model) ? "2560x1024" : "1536x1024", quality: "high", output_format: "png", background: "opaque" }),
      signal: AbortSignal.timeout(240000),
    });
  } catch {
    throw new HttpError(502, "AI 이미지 생성 요청에 실패했거나 시간이 초과되었습니다. 다시 시도해 주세요.");
  }
  if (!response.ok) {
    if (response.status === 429) throw new HttpError(429, "이미지 생성 한도 또는 사용량을 확인한 후 다시 시도해 주세요.");
    if ([401, 403, 404].includes(response.status)) throw new HttpError(503, "선택한 이미지 모델의 접근 권한과 서버 API 키를 확인해 주세요.");
    throw new HttpError(502, "AI 이미지 생성에 실패했습니다. 요청을 수정하거나 다른 모델로 다시 시도해 주세요.");
  }
  const data = await response.json() as { data?: { b64_json?: string }[]; usage?: unknown };
  return { ...generatedPng(data.data?.[0]?.b64_json), usage: data.usage };
}
