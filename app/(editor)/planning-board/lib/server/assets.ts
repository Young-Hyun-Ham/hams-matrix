import "server-only";
import sharp from "sharp";
import { assetUrl } from "../asset-url";
import { requestBytes } from "./request-body";
import { randomUUID, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import type { User } from "@/lib/types";
import { getDocument, putDocument, removeDocument } from "@/lib/r2";
import { access, boardRow, scoped, type Scope } from "./access";
export async function uploadAsset(request: Request, user: User, scope: Scope) {
  await access(user, scope, true);
  const board = await boardRow(user, scope);
  if (board?.status === "review")
    throw new HttpError(409, "검토 중에는 이미지를 첨부할 수 없습니다.");
  if (Number(request.headers.get("content-length")) > 8388608)
    throw new HttpError(413, "이미지는 최대 8MiB입니다.");
  const bytes = await requestBytes(request, 8388608);
  if (!bytes.length || bytes.length > 8388608)
    throw new HttpError(413, "이미지는 최대 8MiB입니다.");
  let mime = "";
  if (
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.length > 24 &&
    bytes.subarray(12, 16).toString() === "IHDR"
  )
    mime = "image/png";
  else if (
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  )
    mime = "image/jpeg";
  else if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP" &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  )
    mime = "image/webp";
  if (!mime)
    throw new HttpError(400, "PNG, JPEG, WebP 이미지만 첨부할 수 있습니다.");
  try {
    const image = sharp(bytes, { limitInputPixels: 40000000, failOn: "error" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || (metadata.pages ?? 1) > 1)
      throw new Error();
    await image.stats();
  } catch {
    throw new HttpError(
      400,
      "손상된 이미지이거나 이미지 해상도가 너무 큽니다. PNG/JPEG/WebP 정지 이미지를 확인해 주세요.",
    );
  }
  await cleanupExpiredAssets(user, scope);
  const id = randomUUID(),
    key = `planning/${user.workspaceId}/${scope.projectId}/${scope.screenId}/${id}`,
    now = new Date().toISOString();
  await putDocument(key, bytes);
  const tx = await db().transaction("write");
  try {
    await access(user, scope, true, tx);
    const current = await boardRow(user, scope, tx);
    if (current?.status === "review")
      throw new HttpError(409, "검토 중에는 이미지를 첨부할 수 없습니다.");
    const count = (
      await tx.execute({
        sql: "SELECT count(*) AS count FROM planning_board_assets WHERE workspace_id=? AND project_id=? AND screen_artifact_id=? AND (status='attached' OR expires_at>?)",
        args: [...scoped(user, scope), now],
      })
    ).rows[0];
    if (Number(count.count) >= 50)
      throw new HttpError(413, "화면당 이미지는 최대 50개입니다.");
    await tx.execute({
      sql: "INSERT INTO planning_board_assets(id,board_id,workspace_id,project_id,screen_artifact_id,draft_id,object_key,mime_type,byte_length,hash,created_by,status,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        id,
        current?.id ?? null,
        ...scoped(user, scope),
        user.id,
        key,
        mime,
        bytes.length,
        createHash("sha256").update(bytes).digest("hex"),
        user.id,
        "pending",
        new Date(Date.now() + 86400000).toISOString(),
        now,
      ],
    });
    await tx.commit();
    return {
      id,
      url: assetUrl(scope, id),
    };
  } catch (e) {
    await tx.rollback();
    await removeDocument(key).catch(() => {});
    throw e;
  } finally {
    tx.close();
  }
}
export async function readAsset(user: User, scope: Scope, id: string) {
  await access(user, scope);
  const row = (
    await db().execute({
      sql: "SELECT * FROM planning_board_assets WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=?",
      args: [id, ...scoped(user, scope)],
    })
  ).rows[0];
  if (
    !row ||
    (row.status === "pending" &&
      (row.created_by !== user.id ||
        String(row.expires_at) <= new Date().toISOString()))
  )
    throw new HttpError(404, "이미지를 찾을 수 없습니다.");
  const bytes = await getDocument(String(row.object_key));
  return new Response(new Uint8Array(bytes).buffer, {
    headers: {
      "Content-Type": String(row.mime_type),
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

async function cleanupExpiredAssets(user: User, scope: Scope) {
  const now = new Date().toISOString();
  const expired = (
    await db().execute({
      sql: "SELECT id,object_key FROM planning_board_assets WHERE workspace_id=? AND project_id=? AND screen_artifact_id=? AND created_by=? AND status='pending' AND expires_at<=? LIMIT 10",
      args: [...scoped(user, scope), user.id, now],
    })
  ).rows;
  for (const asset of expired) {
    try {
      await removeDocument(String(asset.object_key));
      await db().execute({
        sql: "DELETE FROM planning_board_assets WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=? AND created_by=? AND status='pending' AND expires_at<=?",
        args: [asset.id, ...scoped(user, scope), user.id, now],
      });
    } catch {
      /* Retain the scoped expired row so the next upload can retry cleanup. */
    }
  }
}
