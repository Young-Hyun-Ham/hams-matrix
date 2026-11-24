// app/(content-header)/chatbot/components/emulator/runners/runApiNode.ts
import type { AnyNode } from "../types";
import { resolveTemplate } from "../utils";

export async function runApiNode(
  node: AnyNode,
  deps: {
    signal?: AbortSignal;
    slotValues: Record<string, any>;
    formValues: Record<string, any>;
    setSlotValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  },
) {
  const { slotValues, formValues, setSlotValues } = deps;

  try {
    const { url, method, headers, body, responseMapping } = node.data ?? {};
    const ctx = { ...slotValues, ...formValues };

    const resolvedUrl = resolveTemplate(String(url ?? ""), ctx);
    const resolvedBody = body ? resolveTemplate(String(body), ctx) : undefined;

    let parsedHeaders: Record<string, any> = {};
    try {
      parsedHeaders = headers ? JSON.parse(headers) : {};
    } catch {
      throw new Error("Invalid API header JSON");
    }
    if (
      !parsedHeaders ||
      typeof parsedHeaders !== "object" ||
      Array.isArray(parsedHeaders) ||
      Object.values(parsedHeaders).some((value) => typeof value !== "string")
    )
      throw new Error("Invalid API headers");

    const options: any = {
      method: method || "GET",
      headers: parsedHeaders,
      signal: deps.signal,
      credentials: "omit",
    };
    if (
      !["GET", "HEAD"].includes(String(options.method).toUpperCase()) &&
      resolvedBody
    ) {
      options.body = resolvedBody;
    }

    const res = await fetch(resolvedUrl, options);
    if (!res.ok) {
      throw new Error(`API request failed with status ${res.status}`);
    }
    const raw = await res.text();
    let json: unknown = null;
    if (raw) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = raw;
      }
    }

    if (deps.signal?.aborted) return false;
    if (Array.isArray(responseMapping)) {
      setSlotValues((prev: any) => {
        const next = { ...prev };
        responseMapping.forEach((m) => {
          const blocked = ["__proto__", "constructor", "prototype"];
          if (typeof m.slot !== "string" || blocked.includes(m.slot)) return;
          const path = String(m.path ?? "")
            .replace(/^\$\.?/, "")
            .replace(/\[(\d+)\]/g, ".$1")
            .split(".")
            .filter(Boolean);
          let value = json;
          for (const key of path) {
            if (
              blocked.includes(key) ||
              value === null ||
              typeof value !== "object"
            ) {
              value = undefined;
              break;
            }
            value = (value as Record<string, unknown>)[key];
          }
          if (value !== undefined) next[m.slot] = value;
        });
        return next;
      });
    }

    return true;
  } catch (e) {
    console.error("API 실행 오류:", e);
    return false;
  }
}
