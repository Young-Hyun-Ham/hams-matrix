import "server-only";
import { createHash } from "node:crypto";
import { getDocument } from "./r2";
import type { Client, Transaction } from "@libsql/client";
import type { User } from "./types";
import type { Artifact, SourceReference } from "./artifact-types";
import { HttpError } from "./auth";
import { requireProjectPermission } from "./project-permissions";
type Executor = Pick<Client, "execute">;
export async function artifactSources(
  executor: Executor,
  user: User,
  projectId: string,
  id: string,
): Promise<SourceReference[]> {
  const rows = await executor.execute({
    sql: "SELECT * FROM artifact_source_references WHERE artifact_id=? AND project_id=? AND workspace_id=?",
    args: [id, projectId, user.workspaceId],
  });
  return rows.rows.map((r) => ({
    snapshotId: String(r.snapshot_id),
    locator: String(r.locator),
    excerpt: String(r.excerpt),
    rationale: String(r.rationale),
    origin: r.origin as SourceReference["origin"],
  }));
}
export async function readSourceSnapshot(
  executor: Executor,
  user: User,
  projectId: string,
  id: string,
  compareCurrent = true,
) {
  const row = (
    await executor.execute({
      sql: "SELECT * FROM project_source_snapshots WHERE id=? AND project_id=? AND workspace_id=?",
      args: [id, projectId, user.workspaceId],
    })
  ).rows[0];
  if (!row) throw new HttpError(404, "출처를 찾을 수 없습니다.");
  await requireProjectPermission(
    executor,
    user,
    projectId,
    row.source_type === "rfp" ? "rfp" : "documents",
    "READ",
  );
  let changed = false;
  let available = true;
  if (compareCurrent && row.source_type === "rfp") {
    const current = (
      await executor.execute({
        sql: "SELECT id,version FROM project_rfp_documents WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL",
        args: [projectId, user.workspaceId],
      })
    ).rows[0];
    changed =
      !current ||
      current.id !== row.source_id ||
      Number(current.version) !== Number(row.source_version);
  } else if (compareCurrent) {
    const current = (
      await executor.execute({
        sql: "SELECT object_key FROM project_files WHERE id=? AND project_id=? AND workspace_id=?",
        args: [row.source_id, projectId, user.workspaceId],
      })
    ).rows[0];
    if (!current) {
      changed = true;
      available = false;
    } else {
      try {
        changed =
          createHash("sha256")
            .update(Buffer.from(await getDocument(String(current.object_key))))
            .digest("hex") !== row.content_hash;
      } catch {
        changed = true;
      }
    }
  }
  return {
    changed,
    available,
    id: String(row.id),
    type: String(row.source_type),
    sourceId: String(row.source_id),
    version: row.source_version === null ? null : Number(row.source_version),
    name: String(row.name),
    content: String(row.content),
    hash: String(row.content_hash),
  };
}
export async function saveArtifactSources(
  tx: Transaction,
  user: User,
  artifact: Artifact,
  input: unknown,
  action: string,
): Promise<SourceReference[]> {
  if (!Array.isArray(input) || input.length > 50)
    throw new HttpError(400, "출처 목록은 최대 50건입니다.");
  const result: SourceReference[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (!value || typeof value !== "object")
      throw new HttpError(400, "출처 형식을 확인해 주세요.");
    const r = value as SourceReference;
    if (
      ![r.snapshotId, r.locator, r.excerpt, r.rationale].every(
        (v) => typeof v === "string" && v.length <= 3000,
      ) ||
      !["원문 명시", "설계 도출", "사용자 지정"].includes(r.origin)
    )
      throw new HttpError(400, "출처 형식을 확인해 주세요.");
    const snapshot = await readSourceSnapshot(
      tx,
      user,
      artifact.projectId,
      r.snapshotId,
      false,
    );
    if (r.excerpt && !snapshot.content.includes(r.excerpt))
      throw new HttpError(400, "원문에 없는 출처 발췌입니다.");
    const key = r.snapshotId + ":" + r.locator;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(r);
  }
  if (action === "DELETE") return result;
  await tx.execute({
    sql: "DELETE FROM artifact_source_references WHERE artifact_id=? AND project_id=? AND workspace_id=?",
    args: [artifact.id, artifact.projectId, user.workspaceId],
  });
  for (const r of result)
    await tx.execute({
      sql: "INSERT INTO artifact_source_references(artifact_id,snapshot_id,project_id,workspace_id,locator,excerpt,rationale,origin) VALUES (?,?,?,?,?,?,?,?)",
      args: [
        artifact.id,
        r.snapshotId,
        artifact.projectId,
        user.workspaceId,
        r.locator,
        r.excerpt,
        r.rationale,
        r.origin,
      ],
    });
  return result;
}
