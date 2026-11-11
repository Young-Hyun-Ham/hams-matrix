import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth";
import { requestJson } from "./browser-fetch";
export async function serverGetJson<T>(
  path: string,
  options?: { signal?: AbortSignal },
) {
  if (!/^\/api\/(?!\/)/.test(path) || path.includes("\\"))
    throw new Error("Invalid internal API path");
  if (!process.env.APP_URL)
    throw new Error("APP_URL is required for server API reads");
  const origin = new URL(process.env.APP_URL).origin;
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Invalid API origin");
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  const timeout = AbortSignal.timeout(15000);
  return requestJson<T>(url.href, {
    method: "GET",
    signal: options?.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout,
    headers: session ? { Cookie: `${SESSION_COOKIE}=${session}` } : undefined,
  });
}
