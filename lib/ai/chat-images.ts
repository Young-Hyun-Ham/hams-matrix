import "server-only";
import { randomUUID } from "node:crypto";
import type { InStatement, Row } from "@libsql/client";
import { HttpError } from "../auth";
import { encryptImage, decryptImage } from "./image-crypto";
import {
  AI_IMAGE_MAX_BYTES,
  AI_IMAGE_MAX_COUNT,
  AI_IMAGE_MAX_DIMENSION,
  type AiImageInfo,
} from "../ai-image-types";
export type ValidAiImage = {
  dataUrl: string;
  bytes: Buffer;
  width: number;
  height: number;
};
export type ImageScope = {
  chatId: string;
  workspaceId: string;
  userId: string;
  projectId: string;
};
export function validateAiImages(value: unknown, limit = AI_IMAGE_MAX_COUNT): ValidAiImage[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > Math.min(limit, AI_IMAGE_MAX_COUNT))
    throw new HttpError(400, `현재 플랜은 이미지를 최대 ${limit}장까지 첨부할 수 있습니다.`);
  return value.map((item) => {
    if (!item || typeof item !== "object" || typeof item.dataUrl !== "string")
      throw new HttpError(400, "첨부 이미지 형식이 올바르지 않습니다.");
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      item.dataUrl,
    );
    if (!match || match[1].length > 4 * Math.ceil(AI_IMAGE_MAX_BYTES / 3))
      throw new HttpError(
        400,
        "PNG 이미지만 첨부할 수 있으며 한 장당 최대 2MB입니다.",
      );
    const bytes = Buffer.from(match[1], "base64");
    if (
      bytes.toString("base64") !== match[1] ||
      bytes.length > AI_IMAGE_MAX_BYTES ||
      bytes.length < 57 ||
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString("ascii", 12, 16) !== "IHDR"
    )
      throw new HttpError(400, "올바른 PNG 캡처 이미지를 첨부해 주세요.");
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    if (
      !width ||
      !height ||
      width > AI_IMAGE_MAX_DIMENSION ||
      height > AI_IMAGE_MAX_DIMENSION
    )
      throw new HttpError(
        400,
        "이미지 가로·세로는 각각 4096px 이하여야 합니다.",
      );
    let position = 8,
      hasPixels = false,
      ended = false;
    while (position + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(position),
        type = bytes.toString("ascii", position + 4, position + 8);
      if (position + length + 12 > bytes.length) break;
      if (type === "IDAT") hasPixels = true;
      if (type === "IEND") {
        ended = length === 0 && position + 12 === bytes.length;
        break;
      }
      position += length + 12;
    }
    if (!hasPixels || !ended)
      throw new HttpError(400, "손상된 PNG 이미지입니다.");
    return { dataUrl: item.dataUrl, bytes, width, height };
  });
}
function associatedData(scope: ImageScope, info: Omit<AiImageInfo, "url">) {
  return Buffer.from(
    JSON.stringify([
      1,
      scope.chatId,
      scope.workspaceId,
      scope.userId,
      scope.projectId,
      info.id,
      info.mimeType,
      info.byteLength,
      info.width,
      info.height,
    ]),
  );
}
export function imageInfo(row: Row): AiImageInfo {
  return {
    id: String(row.id),
    url: `/api/ai/chats/${encodeURIComponent(String(row.chat_id))}/images/${encodeURIComponent(String(row.id))}`,
    mimeType: String(row.mime_type),
    byteLength: Number(row.byte_length),
    width: Number(row.width),
    height: Number(row.height),
  };
}
export function encryptAiImages(
  images: ValidAiImage[],
  scope: ImageScope,
): { statements: InStatement[]; images: AiImageInfo[] } {
  if (!images.length) return { statements: [], images: [] };
  const statements: InStatement[] = [],
    info: AiImageInfo[] = [];
  images.forEach((image, position) => {
    const metadata = {
      id: randomUUID(),
      mimeType: "image/png",
      byteLength: image.bytes.length,
      width: image.width,
      height: image.height,
    };
    const encrypted = encryptImage(image.bytes, associatedData(scope, metadata));
    statements.push({
      sql: "INSERT INTO ai_chat_images(id,chat_id,workspace_id,user_id,position,mime_type,byte_length,width,height,key_id,iv_base64,tag_base64,ciphertext_base64) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        metadata.id,
        scope.chatId,
        scope.workspaceId,
        scope.userId,
        position,
        metadata.mimeType,
        metadata.byteLength,
        metadata.width,
        metadata.height,
        encrypted.key_id,
        encrypted.iv_base64,
        encrypted.tag_base64,
        encrypted.ciphertext_base64,
      ],
    });
    info.push({
      ...metadata,
      url: `/api/ai/chats/${scope.chatId}/images/${metadata.id}`,
    });
  });
  return { statements, images: info };
}
export function decryptAiImage(row: Row, scope: ImageScope) {
  const { url: unusedUrl, ...info } = imageInfo(row);
  void unusedUrl;
  return decryptImage({
    key_id: row.key_id, encryption_version: row.encryption_version,
    iv_base64: row.iv_base64, tag_base64: row.tag_base64, ciphertext_base64: row.ciphertext_base64,
  }, associatedData(scope, info));
}
