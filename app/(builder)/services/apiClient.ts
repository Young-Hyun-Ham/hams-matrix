import { requestJson } from "@/lib/query/browser-fetch";
type Config = {
  params?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};
async function send(
  method: string,
  url: string,
  data?: unknown,
  config: Config = {},
) {
  const target = new URL(url, window.location.origin);
  if (config.params && typeof config.params === "object")
    for (const [key, value] of Object.entries(config.params))
      if (value !== undefined && value !== null)
        target.searchParams.set(key, String(value));
  // This client deliberately adds no BAPS bearer token or Matrix credentials to external URLs.
  return requestJson<any>(target.href, {
    method,
    credentials:
      target.origin === window.location.origin ? "same-origin" : "omit",
    headers: { "Content-Type": "application/json", ...config.headers },
    signal: config.signal,
    body:
      method === "GET" || method === "HEAD" ? undefined : JSON.stringify(data),
  });
}
const apiClient = {
  get: (u: string, c?: Config) => send("GET", u, undefined, c),
  delete: (u: string, c?: Config) => send("DELETE", u, undefined, c),
  post: (u: string, d?: unknown, c?: Config) => send("POST", u, d, c),
  patch: (u: string, d?: unknown, c?: Config) => send("PATCH", u, d, c),
  put: (u: string, d?: unknown, c?: Config) => send("PUT", u, d, c),
};
export default apiClient;
