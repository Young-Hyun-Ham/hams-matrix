import { requestJson } from "./query/browser-fetch";
export async function jsonRequest(url: string, init?: RequestInit) {
  return requestJson<Awaited<ReturnType<Response["json"]>>>(url, init);
}
