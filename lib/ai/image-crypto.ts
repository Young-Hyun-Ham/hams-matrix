import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { HttpError } from "../auth";

export function imageEncryptionKey() {
  const encoded = process.env.AI_IMAGE_ENCRYPTION_KEY?.trim() ?? "";
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw new HttpError(503, "이미지 암호화 키가 설정되지 않았습니다. 서버 설정을 확인해 주세요.");
  return { key, keyId: createHash("sha256").update(key).digest("hex").slice(0, 24) };
}

export function encryptImage(bytes: Buffer, associatedData: Buffer) {
  const { key, keyId } = imageEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(associatedData);
  const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    key_id: keyId, encryption_version: 1,
    iv_base64: iv.toString("base64"), tag_base64: cipher.getAuthTag().toString("base64"),
    ciphertext_base64: ciphertext.toString("base64"),
  };
}

export function decryptImage(row: {
  key_id: unknown; encryption_version: unknown; iv_base64: unknown;
  tag_base64: unknown; ciphertext_base64: unknown;
}, associatedData: Buffer) {
  try {
    const { key, keyId } = imageEncryptionKey();
    if (Number(row.encryption_version) !== 1 || row.key_id !== keyId) throw new Error();
    const iv = Buffer.from(String(row.iv_base64), "base64");
    const tag = Buffer.from(String(row.tag_base64), "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(associatedData);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(String(row.ciphertext_base64), "base64")), decipher.final()]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(500, "이미지를 복호화하지 못했습니다. 서버 키 또는 저장 데이터를 확인해 주세요.");
  }
}
