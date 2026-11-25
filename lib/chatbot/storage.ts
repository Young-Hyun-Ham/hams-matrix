import "server-only";
import { db } from "@/lib/db";
import { putDocument, getDocument, removeDocument } from "@/lib/r2";
import type { User } from "@/lib/types";
import { generatedPng } from "@/lib/ai/image-generation";
import {
  owned,
  ownerArgs,
  object,
  text,
  now,
  uuid,
  hash,
  future,
  fail,
  seal,
  unseal,
} from "./server";
export async function putBlob(
  u: User,
  id: string,
  bytes: Buffer,
  source?: string,
) {
  const key = `chatbot/${u.workspaceId}/${u.id}/${id}`;
  await db().execute({
    sql: "INSERT INTO chatbot_blob_uploads(id,workspace_id,user_id,storage_key,status,created_at) VALUES (?,?,?,?,'staged',?)",
    args: [id, ...ownerArgs(u), key, now()],
  });
  await putDocument(
    key,
    Buffer.from(
      seal(u, id, {
        base64: bytes.toString("base64"),
        ...(source === undefined ? {} : { source }),
      }),
    ),
  );
  return key;
}
export async function blob(u: User, id: string, storageKey: unknown) {
  const bytes = await getDocument(String(storageKey));
  return Buffer.from(
    unseal<{ base64: string }>(u, id, Buffer.from(bytes).toString("utf8"))
      .base64,
    "base64",
  );
}
export async function documentBlob(u: User, id: string, storageKey: unknown) {
  const bytes = await getDocument(String(storageKey));
  const payload = unseal<{ base64: string; source?: string }>(
    u,
    id,
    Buffer.from(bytes).toString("utf8"),
  );
  return (
    payload.source ?? Buffer.from(payload.base64, "base64").toString("utf8")
  );
}
export async function upload(u: User, raw: unknown) {
  const b = object(raw),
    conversationId = text(b.conversationId, 150);
  await owned("chatbot_conversations", u, conversationId);
  const mime = text(b.mime, 100),
    name = text(b.name, 150).replace(/[\\/\r\n\0]/g, "_");
  if (
    !["image/png", "image/jpeg", "text/plain", "text/markdown"].includes(mime)
  )
    fail(415, "PNG/JPEG/Markdown/텍스트 파일만 첨부할 수 있습니다.");
  if (
    typeof b.base64 !== "string" ||
    b.base64.length > 11200000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(b.base64)
  )
    fail(413, "첨부 파일 크기 또는 형식을 확인해 주세요.");
  const bytes = Buffer.from(b.base64, "base64");
  if (
    !bytes.length ||
    bytes.length > 8388608 ||
    bytes.toString("base64") !== b.base64
  )
    fail(413, "첨부는 최대 8MB입니다.");
  if (mime === "image/png") generatedPng(b.base64);
  if (
    mime === "image/jpeg" &&
    (bytes.length < 4 ||
      bytes.readUInt16BE(0) !== 0xffd8 ||
      bytes.readUInt16BE(bytes.length - 2) !== 0xffd9)
  )
    fail(415, "JPEG 형식을 확인해 주세요.");
  if (
    mime.startsWith("text/") &&
    (bytes.length > 200000 || bytes.toString("utf8").includes("\u0000"))
  )
    fail(413, "텍스트 첨부는 최대 200KB입니다.");
  const id = uuid(),
    storageKey = await putBlob(u, id, bytes);
  try {
    await db().execute({
      sql: "INSERT INTO chatbot_attachments(id,workspace_id,user_id,conversation_id,name,mime_type,size_bytes,sha256,storage_key,status,expires_at) VALUES (?,?,?,?,?,?,?,?,?,'ready',?)",
      args: [
        id,
        ...ownerArgs(u),
        conversationId,
        name,
        mime,
        bytes.length,
        hash(bytes.toString("base64")),
        storageKey,
        future(),
      ],
    });
  } catch (e) {
    await removeDocument(storageKey);
    throw e;
  }
  await db().execute({
    sql: "UPDATE chatbot_blob_uploads SET status='linked' WHERE id=?",
    args: [id],
  });
  return { id, name, mime, size: bytes.length };
}
export async function attachment(u: User, id: string, remove = false) {
  const r = await owned("chatbot_attachments", u, id);
  await owned("chatbot_conversations", u, String(r.conversation_id));
  if (remove) {
    // A sent request owns an immutable reference. Hide the upload without removing its bytes.
    await db().execute({
      sql: "UPDATE chatbot_attachments SET status='deleted' WHERE id=?",
      args: [id],
    });
    return { deleted: true };
  }
  return {
    id,
    name: String(r.name),
    mime: String(r.mime_type),
    size: Number(r.size_bytes),
  };
}
export async function artifactVersion(
  u: User,
  artifactId: string,
  versionId: string,
  download = false,
) {
  const a = await owned("chatbot_artifacts", u, artifactId),
    v = await owned("chatbot_artifact_versions", u, versionId);
  if (a.conversation_id)
    await owned("chatbot_conversations", u, String(a.conversation_id));
  if (v.artifact_id !== artifactId || v.status !== "published")
    fail(404, "공개된 생성물을 찾을 수 없습니다.");
  if (!download) {
    let content: string | undefined;
    if (a.kind === "file") {
      const bytes = await blob(u, versionId, v.storage_key);
      if (hash(bytes.toString("base64")) !== v.sha256)
        fail(500, "문서 무결성을 확인할 수 없습니다.");
      content = await documentBlob(u, versionId, v.storage_key);
    }
    return {
      id: artifactId,
      versionId,
      title: String(a.title),
      kind: String(a.kind),
      version: Number(v.version_number),
      mime: String(v.mime_type),
      format: v.format === "mmd" ? "mermaid" : String(v.format),
      ...(content === undefined ? {} : { content }),
    };
  }
  const bytes = await blob(u, versionId, v.storage_key);
  if (hash(bytes.toString("base64")) !== v.sha256)
    fail(500, "파일 무결성을 확인할 수 없습니다.");
  const name = `${String(a.title)
    .replace(/[^\p{L}\p{N} _-]/gu, "_")
    .slice(0, 60)}.${v.format}`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": String(v.mime_type),
      "Content-Disposition": `${a.kind === "image" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
