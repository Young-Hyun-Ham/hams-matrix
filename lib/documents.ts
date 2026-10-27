import "server-only";
import type { Client } from "@libsql/client";
import { HttpError } from "./auth";
import { MAX_DOCUMENT_BYTES } from "./document-types";

export function documentName(value: unknown, limit = 100) {
  const name = typeof value === "string" ? value.trim().normalize("NFC") : "";
  if (!name || name.length > limit || /[\\/\u0000-\u001f\u007f]/.test(name) || name === "." || name === "..")
    throw new HttpError(400, `이름은 경로 문자 없이 1~${limit}자로 입력해 주세요.`);
  return name;
}
export function folderId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(value))
    throw new HttpError(400, "폴더를 확인해 주세요.");
  return value;
}
export async function requireFolder(executor: Pick<Client, "execute">, workspaceId: string, projectId: string, id: string | null) {
  if (!id) return;
  const result = await executor.execute({ sql: "SELECT id FROM project_folders WHERE id=? AND workspace_id=? AND project_id=?", args: [id, workspaceId, projectId] });
  if (!result.rows.length) throw new HttpError(404, "폴더를 찾을 수 없습니다. 목록을 새로고침해 주세요.");
}
export async function readDocumentUpload(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_DOCUMENT_BYTES)
    throw new HttpError(413, "파일은 20MB까지 업로드할 수 있습니다.");
  if (!request.body) throw new HttpError(400, "파일을 선택해 주세요.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DOCUMENT_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "파일은 20MB까지 업로드할 수 있습니다.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new HttpError(400, "빈 파일은 업로드할 수 없습니다.");
  return Buffer.concat(chunks);
}
