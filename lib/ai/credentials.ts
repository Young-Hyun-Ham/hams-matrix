import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { Row } from "@libsql/client";
import { HttpError } from "../auth";

function encryptionKey() {
  const encoded = process.env.AI_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw new HttpError(503, "프로젝트 AI 키 암호화 설정을 확인해 주세요.");
  return {
    key,
    keyId: createHash("sha256").update(key).digest("hex").slice(0, 24),
  };
}
export function apiKeyInput(value: unknown) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > 1024 ||
    /[\r\n\x00]/.test(value)
  )
    throw new HttpError(400, "OpenAI API 키를 입력해 주세요.");
  return value.trim();
}
function aad(id: string, workspaceId: string, projectId: string) {
  return Buffer.from(JSON.stringify([id, workspaceId, projectId, "openai"]));
}
export function credentialFingerprint(value: string) {
  return createHmac("sha256", encryptionKey().key).update(value).digest("hex");
}
export function encryptCredential(
  value: string,
  id: string,
  workspaceId: string,
  projectId: string,
) {
  const { key, keyId } = encryptionKey(),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(id, workspaceId, projectId));
  const ciphertext = Buffer.concat([
    cipher.update(apiKeyInput(value), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyId,
    fingerprint: credentialFingerprint(value),
  };
}
export function decryptCredential(
  row: Row,
  workspaceId: string,
  projectId: string,
) {
  if (
    row.revoked_at ||
    row.workspace_id !== workspaceId ||
    row.project_id !== projectId
  )
    throw new HttpError(403, "프로젝트 AI 키를 사용할 수 없습니다.");
  const { key, keyId } = encryptionKey();
  try {
    if (row.key_id !== keyId || row.encryption_version !== 1) throw Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(String(row.iv), "base64"),
    );
    decipher.setAAD(aad(String(row.id), workspaceId, projectId));
    decipher.setAuthTag(Buffer.from(String(row.auth_tag), "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(String(row.ciphertext), "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HttpError(
      503,
      "프로젝트 AI 키를 복호화할 수 없습니다. 관리자에게 키 갱신을 요청해 주세요.",
    );
  }
}
