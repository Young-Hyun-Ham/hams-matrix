import "server-only";
import {
  createHash,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import type { Transaction, InValue, Row } from "@libsql/client";
import { db } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/auth";
import type { User } from "@/lib/types";
export type Owner = Pick<User, "id" | "workspaceId">;
export const now = () => new Date().toISOString();
export const future = (ms = 86400000) =>
  new Date(Date.now() + ms).toISOString();
export const uuid = randomUUID;
export const hash = (v: unknown) =>
  createHash("sha256")
    .update(typeof v === "string" ? v : JSON.stringify(v))
    .digest("hex");
export const ownerArgs = (u: Owner): InValue[] => [u.workspaceId, u.id];
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail(400, "객체 형식을 확인해 주세요.");
export const text = (v: unknown, max = 2000, min = 1) =>
  typeof v === "string" && v.trim().length >= min && v.length <= max
    ? v.trim()
    : fail(400, "입력 길이 또는 형식을 확인해 주세요.");
export const number = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0
    ? v
    : fail(400, "버전 값을 확인해 주세요.");
export const requestKey = (v: unknown) => {
  const key = text(v, 100);
  if (!/^[\w:-]+$/.test(key)) fail(400, "요청 ID가 올바르지 않습니다.");
  return key;
};
export async function chatbotUser() {
  return requireUser();
}
export async function transaction<T>(fn: (tx: Transaction) => Promise<T>) {
  const tx = await db().transaction("write");
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
export async function owned(
  table: string,
  u: Owner,
  id: string,
  executor: Pick<Transaction, "execute"> = db(),
): Promise<Row> {
  // All callers supply a literal internal table name, never an HTTP path or payload.
  if (!/^chatbot_[a-z_]+$/.test(table)) throw Error("Invalid internal table");
  const r = (
    await executor.execute({
      sql: `SELECT * FROM ${table} WHERE workspace_id=? AND user_id=? AND id=?`,
      args: [...ownerArgs(u), id],
    })
  ).rows[0];
  if (!r || r.deleted_at) fail(404, "자료를 찾을 수 없습니다.");
  return r;
}
function key() {
  const encoded =
    process.env.AI_CREDENTIAL_ENCRYPTION_KEY ||
    process.env.AI_IMAGE_ENCRYPTION_KEY ||
    "";
  const value = Buffer.from(encoded, "base64");
  if (value.length !== 32 || value.toString("base64") !== encoded)
    fail(503, "챗봇 암호화 설정을 확인해 주세요.");
  return value;
}
export function seal(u: Owner, id: string, value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(
    Buffer.from(JSON.stringify(["chatbot", 1, u.workspaceId, u.id, id])),
  );
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
}
export function unseal<T = Record<string, unknown>>(
  u: Owner,
  id: string,
  encrypted: unknown,
): T {
  const v = JSON.parse(String(encrypted));
  if (v.v !== 1) throw Error("Unsupported chatbot checkpoint");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(v.iv, "base64"),
  );
  decipher.setAAD(
    Buffer.from(JSON.stringify(["chatbot", 1, u.workspaceId, u.id, id])),
  );
  decipher.setAuthTag(Buffer.from(v.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(v.data, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  ) as T;
}

export async function currentActor(
  u: User,
  executor: Pick<Transaction, "execute"> = db(),
): Promise<User> {
  const r = (
    await executor.execute({
      sql: "SELECT u.account_role,u.onboarding_complete,m.role FROM users u JOIN workspace_members m ON m.user_id=u.id WHERE u.id=? AND m.workspace_id=?",
      args: [u.id, u.workspaceId],
    })
  ).rows[0];
  if (!r || Number(r.onboarding_complete) !== 1 || r.account_role === "guest")
    fail(403, "현재 워크스페이스 접근 권한이 없습니다.");
  return {
    ...u,
    role: String(r.role),
    accountRole: r.account_role as User["accountRole"],
    onboardingComplete: true,
  };
}
