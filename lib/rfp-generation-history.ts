import "server-only";
import { db } from "./db";
import { HttpError } from "./auth";
import { requireProjectPermission } from "./project-permissions";
import type { User } from "./types";
import type { RfpGenerationHistory } from "./rfp-source-types";

export async function readRfpGenerationHistory(
  user: User,
  projectId: string,
  cursor: string | null,
): Promise<RfpGenerationHistory> {
  await requireProjectPermission(db(), user, projectId, "rfp", "READ");
  await requireProjectPermission(db(), user, projectId, "documents", "READ");
  let before: { createdAt: string; requestId: string } | null = null;
  if (cursor !== null) {
    try {
      if (cursor.length > 1024) throw new Error();
      const value = JSON.parse(
        Buffer.from(cursor, "base64url").toString("utf8"),
      );
      if (
        typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt)) ||
        typeof value.requestId !== "string" ||
        value.requestId.length > 100
      )
        throw new Error();
      before = value;
    } catch {
      throw new HttpError(400, "이력 조회 위치가 올바르지 않습니다.");
    }
  }
  const rows = (
    await db().execute({
      sql: `SELECT request_id,status,source_name,model,input_json,document_version,error_code,created_at,finished_at,lease_until
      FROM project_rfp_generation_requests WHERE workspace_id=? AND project_id=? AND user_id=?
      ${before ? "AND (created_at<? OR (created_at=? AND request_id<?))" : ""}
      ORDER BY created_at DESC,request_id DESC LIMIT 21`,
      args: [
        user.workspaceId,
        projectId,
        user.id,
        ...(before
          ? [before.createdAt, before.createdAt, before.requestId]
          : []),
      ],
    })
  ).rows;
  const page = rows.slice(0, 20),
    last = page.at(-1);
  return {
    items: page.map((row) => {
      let prompt = "";
      try {
        const input = JSON.parse(String(row.input_json));
        if (typeof input.prompt === "string") prompt = input.prompt;
      } catch {}
      const expired =
        ["running", "stop_requested", "finalizing"].includes(
          String(row.status),
        ) && String(row.lease_until) <= new Date().toISOString();
      return {
        requestId: String(row.request_id),
        status: expired
          ? "failed"
          : (row.status as RfpGenerationHistory["items"][number]["status"]),
        sourceName: String(row.source_name),
        model: String(row.model),
        prompt,
        documentVersion:
          row.document_version === null ? null : Number(row.document_version),
        errorCode: expired
          ? 504
          : row.error_code === null
            ? null
            : Number(row.error_code),
        createdAt: String(row.created_at),
        finishedAt: row.finished_at === null ? null : String(row.finished_at),
      };
    }),
    nextCursor:
      rows.length > 20 && last
        ? Buffer.from(
            JSON.stringify({
              createdAt: String(last.created_at),
              requestId: String(last.request_id),
            }),
          ).toString("base64url")
        : null,
  };
}
