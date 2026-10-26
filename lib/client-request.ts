export async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "요청에 실패했습니다.");
  return result;
}
