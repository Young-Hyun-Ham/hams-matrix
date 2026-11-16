import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "./db";
import { HttpError } from "./auth";
import type { User } from "./types";
import { requireProjectPermission } from "./project-permissions";
import { readRfp } from "./rfp-server";
import { getDocument } from "./r2";
import { extractDocumentText } from "./document-text";
import { rfpSourceExtension } from "./rfp-sources";
export type CapturedSource = {
  id: string;
  type: "rfp" | "file";
  sourceId: string;
  version: number | null;
  name: string;
  content: string;
  hash: string;
  objectKey?: string;
  size?: number;
  updated?: string;
};
export async function captureSource(
  user: User,
  projectId: string,
  input: { type: string; id?: string },
  signal: AbortSignal,
): Promise<CapturedSource> {
  if (input.type === "rfp") {
    const doc = (await readRfp(db(), user, projectId)).document;
    if (!doc) throw new HttpError(400, "저장된 제안요청서가 없습니다.");
    const content = JSON.stringify(doc.draft);
    return {
      id: randomUUID(),
      type: "rfp",
      sourceId: doc.id,
      version: doc.version,
      name: doc.draft.title || "제안요청서",
      content,
      hash: createHash("sha256").update(content).digest("hex"),
    };
  }
  if (input.type !== "file" || typeof input.id !== "string")
    throw new HttpError(400, "출처를 확인해 주세요.");
  await requireProjectPermission(db(), user, projectId, "documents", "READ");
  const row = (
    await db().execute({
      sql: "SELECT * FROM project_files WHERE id=? AND project_id=? AND workspace_id=?",
      args: [input.id, projectId, user.workspaceId],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "파일을 찾을 수 없습니다.");
  const bytes = Buffer.from(await getDocument(String(row.object_key)));
  if (
    bytes.length > 20 * 1024 * 1024 ||
    bytes.length !== Number(row.byte_length)
  )
    throw new HttpError(413, "원본 파일의 크기를 확인해 주세요.");
  const content = await extractDocumentText(
    bytes,
    rfpSourceExtension(String(row.name)),
    signal,
  );
  return {
    id: randomUUID(),
    type: "file",
    sourceId: input.id,
    version: null,
    name: String(row.name),
    content,
    hash: createHash("sha256").update(bytes).digest("hex"),
    objectKey: String(row.object_key),
    size: Number(row.byte_length),
    updated: String(row.updated_at ?? ""),
  };
}
export async function verifyCapturedSources(
  executor: Pick<Client, "execute">,
  user: User,
  projectId: string,
  sources: CapturedSource[],
) {
  for (const s of sources) {
    await requireProjectPermission(
      executor,
      user,
      projectId,
      s.type === "rfp" ? "rfp" : "documents",
      "READ",
    );
    if (s.type === "rfp") {
      const doc = (await readRfp(executor, user, projectId)).document;
      if (doc?.id !== s.sourceId || doc.version !== s.version)
        throw new HttpError(409, "생성 중 제안요청서가 변경되었습니다.");
    } else {
      const row = (
        await executor.execute({
          sql: "SELECT object_key,byte_length,updated_at FROM project_files WHERE id=? AND project_id=? AND workspace_id=?",
          args: [s.sourceId, projectId, user.workspaceId],
        })
      ).rows[0];
      if (
        !row ||
        row.object_key !== s.objectKey ||
        Number(row.byte_length) !== s.size ||
        String(row.updated_at ?? "") !== s.updated
      )
        throw new HttpError(409, "생성 중 첨부 원본이 변경되었습니다.");
    }
  }
}
export async function persistCapturedSource(
  executor: Pick<Client, "execute">,
  user: User,
  projectId: string,
  s: CapturedSource,
) {
  await executor.execute({
    sql: "INSERT INTO project_source_snapshots(id,workspace_id,project_id,source_type,source_id,source_version,name,content_hash,content,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    args: [
      s.id,
      user.workspaceId,
      projectId,
      s.type,
      s.sourceId,
      s.version,
      s.name,
      s.hash,
      s.content,
      user.id,
      new Date().toISOString(),
    ],
  });
}
