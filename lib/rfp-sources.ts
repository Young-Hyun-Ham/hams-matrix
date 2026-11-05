import "server-only";
import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "./db";
import { HttpError } from "./auth";
import { audit } from "./audit";
import type { User } from "./types";
import { requireProjectPermission } from "./project-permissions";
import { documentName, readDocumentUpload } from "./documents";
import { extractDocumentText } from "./document-text";
import { putDocument, removeDocument } from "./r2";
import {
  RFP_SOURCE_EXTENSIONS,
  RFP_SOURCE_MAX_BYTES,
  type RfpSource,
} from "./rfp-source-types";

type Executor = Pick<Client, "execute">;
export function sourceVersion(value: unknown) {
  const version =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 0
  )
    throw new HttpError(400, "원본 파일 버전을 확인해 주세요.");
  return version;
}
export function rfpSourceExtension(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!RFP_SOURCE_EXTENSIONS.includes(extension))
    throw new HttpError(
      400,
      "PDF·DOCX·UTF-8 TXT/MD 파일만 지원합니다. 최대 20MB, PDF 50페이지입니다.",
    );
  return extension;
}
export async function rfpSourceRow(
  executor: Executor,
  user: User,
  projectId: string,
) {
  return (
    await executor.execute({
      sql: `SELECT s.version,s.file_id,f.name,f.object_key,f.byte_length,f.created_at,u.name AS uploader
      FROM project_rfp_sources s LEFT JOIN project_files f ON f.id=s.file_id AND f.project_id=s.project_id AND f.workspace_id=s.workspace_id
      LEFT JOIN users u ON u.id=f.created_by WHERE s.project_id=? AND s.workspace_id=?`,
      args: [projectId, user.workspaceId],
    })
  ).rows[0];
}
export async function expireRfpGenerations(
  executor: Executor,
  workspaceId: string,
  projectId: string,
) {
  const now = new Date().toISOString();
  await executor.execute({
    sql: `UPDATE project_rfp_generation_requests SET status='failed',error_code=504,finished_at=?
    WHERE workspace_id=? AND project_id=? AND status IN ('running','stop_requested','finalizing') AND lease_until<=?`,
    args: [now, workspaceId, projectId, now],
  });
}
export async function assertRfpSourceIdle(
  executor: Executor,
  user: User,
  projectId: string,
) {
  await expireRfpGenerations(executor, user.workspaceId, projectId);
  const active = (
    await executor.execute({
      sql: "SELECT request_id FROM project_rfp_generation_requests WHERE workspace_id=? AND project_id=? AND status IN ('running','stop_requested','finalizing') LIMIT 1",
      args: [user.workspaceId, projectId],
    })
  ).rows[0];
  if (active)
    throw new HttpError(
      409,
      "AI 생성 중에는 원본을 교체하거나 해제할 수 없습니다.",
    );
}
export async function readRfpSource(
  user: User,
  projectId: string,
): Promise<RfpSource> {
  await requireProjectPermission(db(), user, projectId, "rfp", "READ");
  await requireProjectPermission(db(), user, projectId, "documents", "READ");
  const row = await rfpSourceRow(db(), user, projectId);
  const active = (
    await db().execute({
      sql: "SELECT request_id,user_id FROM project_rfp_generation_requests WHERE workspace_id=? AND project_id=? AND status IN ('running','stop_requested','finalizing') AND lease_until>? LIMIT 1",
      args: [user.workspaceId, projectId, new Date().toISOString()],
    })
  ).rows[0];
  return {
    version: Number(row?.version ?? 0),
    file: row?.file_id
      ? {
          id: String(row.file_id),
          name: String(row.name),
          size: Number(row.byte_length),
          createdAt: String(row.created_at),
          uploadedBy: String(row.uploader),
        }
      : null,
    active: !!active,
    requestId: active?.user_id === user.id ? String(active.request_id) : null,
  };
}
export async function uploadRfpSource(
  request: Request,
  user: User,
  projectId: string,
  replace: boolean,
) {
  const query = new URL(request.url).searchParams;
  const name = documentName(query.get("name"), 255),
    extension = rfpSourceExtension(name);
  const expected = sourceVersion(query.get("expectedSourceVersion") ?? "0");
  const action = replace ? "UPDATE" : "CREATE";
  const check = async (executor: Executor) => {
    await requireProjectPermission(executor, user, projectId, "rfp", action);
    await requireProjectPermission(
      executor,
      user,
      projectId,
      "documents",
      "CREATE",
    );
    await assertRfpSourceIdle(executor, user, projectId);
    const before = await rfpSourceRow(executor, user, projectId);
    if (
      Number(before?.version ?? 0) !== expected ||
      (replace ? !before?.file_id : !!before?.file_id)
    )
      throw new HttpError(
        409,
        "원본 연결이 변경되었습니다. 최신 내용을 조회해 주세요.",
      );
  };
  await check(db());
  const bytes = await readDocumentUpload(request, RFP_SOURCE_MAX_BYTES);
  await extractDocumentText(bytes, extension, request.signal);
  const id = randomUUID(),
    key = `workspaces/${user.workspaceId}/projects/${projectId}/documents/${id}`;
  await putDocument(key, bytes);
  try {
    const tx = await db().transaction("write");
    try {
      await check(tx);
      await tx.execute({
        sql: "INSERT INTO project_files(id,workspace_id,project_id,folder_id,name,object_key,byte_length,mime_type,created_by) VALUES (?,?,?,NULL,?,?,?,?,?)",
        args: [
          id,
          user.workspaceId,
          projectId,
          name,
          key,
          bytes.length,
          "application/octet-stream",
          user.id,
        ],
      });
      const now = new Date().toISOString();
      await tx.execute({
        sql: `INSERT INTO project_rfp_sources(project_id,workspace_id,file_id,version,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(project_id) DO UPDATE SET file_id=excluded.file_id,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
        args: [
          projectId,
          user.workspaceId,
          id,
          expected + 1,
          user.id,
          user.id,
          now,
          now,
        ],
      });
      await audit(
        request,
        {
          user,
          action,
          resource: "rfp_source",
          resourceId: id,
          after: { name, version: expected + 1 },
          metadata: { projectId, byteLength: bytes.length },
        },
        tx,
      );
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  } catch (error) {
    try {
      await removeDocument(key);
    } catch {
      console.error("RFP source upload cleanup failed", id, key);
    }
    throw error;
  }
  return readRfpSource(user, projectId);
}
export async function detachRfpSource(
  request: Request,
  user: User,
  projectId: string,
  expected: unknown,
) {
  const version = sourceVersion(expected),
    tx = await db().transaction("write");
  try {
    await requireProjectPermission(tx, user, projectId, "rfp", "DELETE");
    await assertRfpSourceIdle(tx, user, projectId);
    const row = await rfpSourceRow(tx, user, projectId);
    if (!row?.file_id || Number(row.version) !== version)
      throw new HttpError(
        409,
        "원본 연결이 변경되었습니다. 최신 내용을 조회해 주세요.",
      );
    await tx.execute({
      sql: "UPDATE project_rfp_sources SET file_id=NULL,version=version+1,updated_by=?,updated_at=? WHERE project_id=? AND workspace_id=?",
      args: [user.id, new Date().toISOString(), projectId, user.workspaceId],
    });
    await audit(
      request,
      {
        user,
        action: "DELETE",
        resource: "rfp_source",
        resourceId: String(row.file_id),
        metadata: { projectId, detached: true },
      },
      tx,
    );
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
  return readRfpSource(user, projectId);
}
// Used by both library mutations and ONLYOFFICE callbacks; file ID alone is never a scope.
export async function protectRfpSourceFile(
  executor: Executor,
  user: User,
  projectId: string,
  fileId: string,
  action: "UPDATE" | "DELETE",
  name?: string,
) {
  const row = await rfpSourceRow(executor, user, projectId);
  if (row?.file_id !== fileId) return;
  if (action === "DELETE")
    throw new HttpError(
      409,
      "제안요청서 원본입니다. 제안요청서 탭에서 먼저 첨부를 해제해 주세요.",
    );
  await requireProjectPermission(executor, user, projectId, "rfp", "UPDATE");
  if (name && rfpSourceExtension(name) !== rfpSourceExtension(String(row.name)))
    throw new HttpError(400, "제안요청서 원본의 확장자는 변경할 수 없습니다.");
}
