import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { HttpError } from "@/lib/auth";
import { fail, object } from "./server";
export class ConnectorHTTPError extends HttpError {
  constructor() {
    super(502, "외부 API가 실패 응답을 반환했습니다.");
  }
}
function publicIP(ip: string) {
  if (isIP(ip) === 6)
    return /^2[0-9a-f]{3}:/i.test(ip) && !/^2001:(?:0:|db8:)/i.test(ip);
  if (isIP(ip) !== 4) return false;
  const [a, b] = ip.split(".").map(Number);
  return (
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a < 224 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) &&
    !(a === 192 && [0, 168].includes(b)) &&
    !(a === 100 && b >= 64 && b <= 127) &&
    !(a === 198 && [18, 19, 51].includes(b)) &&
    !(a === 203 && b === 0)
  );
}
export function connectorURL(raw: string) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return fail(400, "API URL을 확인해 주세요.");
  }
  const hosts = (process.env.CHATBOT_API_ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !hosts.includes(url.hostname.toLowerCase()) ||
    isIP(url.hostname)
  )
    fail(403, "서버에서 허용한 HTTPS API만 실행할 수 있습니다.");
  for (const key of url.searchParams.keys())
    if (/token|secret|password|api.?key/i.test(key))
      fail(400, "URL에 인증정보를 넣을 수 없습니다.");
  return url;
}
export async function connector(
  raw: string,
  method: string,
  body: string | undefined,
  signal: AbortSignal,
) {
  const url = connectorURL(raw),
    addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((v) => !publicIP(v.address)))
    fail(403, "사설망 API는 실행할 수 없습니다.");
  const pin = addresses[0];
  let configured: Record<string, unknown> = {};
  if (process.env.CHATBOT_CONNECTOR_HEADERS) {
    try {
      configured = object(JSON.parse(process.env.CHATBOT_CONNECTOR_HEADERS));
    } catch {
      return fail(503, "서버 커넥터 설정을 확인해 주세요.");
    }
  }
  const credentials = configured[url.hostname]
    ? object(configured[url.hostname])
    : {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  for (const [key, value] of Object.entries(credentials)) {
    if (
      typeof value !== "string" ||
      /[\r\n]/.test(key + value) ||
      ["host", "content-length", "transfer-encoding", "connection"].includes(
        key.toLowerCase(),
      )
    )
      fail(503, "서버 커넥터 헤더를 확인해 주세요.");
    headers[key] = value;
  }
  return new Promise<unknown>((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        signal,
        headers,
        lookup: (_host, _options, callback) =>
          callback(null, [{ address: pin.address, family: pin.family }]),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1000000) {
            req.destroy();
            reject(Error("API response size exceeded"));
          } else chunks.push(chunk);
        });
        res.on("end", () => {
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300)
            return reject(new ConnectorHTTPError());
          const data = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
        res.on("error", reject);
      },
    );
    req.setTimeout(30000, () => req.destroy(Error("API timeout")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
