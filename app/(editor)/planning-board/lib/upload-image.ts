import { boardBase, planningFetch } from "./client-api";
export async function uploadImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  if (blob.size > 8 * 1024 * 1024) throw new Error("이미지는 최대 8MiB입니다.");
  const response = await planningFetch(`${boardBase()}/assets`, {
    method: "POST",
    headers: { "Content-Type": blob.type },
    body: blob,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "이미지를 첨부하지 못했습니다.");
  return result.url;
}
