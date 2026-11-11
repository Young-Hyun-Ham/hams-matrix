import { RequestError } from "./error-messages";
export async function requestJson<T>(
  url: string,
  init?: RequestInit,
  transport: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await transport(url, { cache: "no-store", ...init });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new RequestError(
      null,
      undefined,
      undefined,
      undefined,
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout"
        : "network",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    if (response.ok) throw new RequestError(response.status, "INVALID_JSON");
  }
  if (!response.ok) {
    const after = response.headers.get("retry-after");
    const delay = after
      ? /^\d+$/.test(after)
        ? Number(after) * 1000
        : Math.max(0, Date.parse(after) - Date.now())
      : undefined;
    const failure = new RequestError(
      response.status,
      data?.code ?? data?.details?.code,
      data?.details,
      response.headers.get("x-request-id") ?? undefined,
      "http",
      Number.isFinite(delay) ? delay : undefined,
    );
    failure.payload = data;
    throw failure;
  }
  return data as T;
}
export const browserGetJson = <T>(
  url: string,
  options?: { signal?: AbortSignal },
) => requestJson<T>(url, options);
export async function requestBlob(
  url: string,
  init?: RequestInit,
  transport: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<Blob> {
  let response: Response;
  try {
    response = await transport(url, { cache: "no-store", ...init });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new RequestError(
      null,
      undefined,
      undefined,
      undefined,
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout"
        : "network",
    );
  }
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {}
    throw new RequestError(
      response.status,
      data?.code,
      data?.details,
      response.headers.get("x-request-id") ?? undefined,
    );
  }
  return response.blob();
}
