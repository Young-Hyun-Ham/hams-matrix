import { requireProjectPermission, projectPermissionAccess } from "./project-permissions";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { db } from "./db";
import { HttpError } from "./auth";
import { audit } from "./audit";
import { projectAccess, projectData } from "./artifacts";
import { scheduleVersions, type WbsPublication } from "./wbs-schedule";
import { prepareStructure, validateProjectGraph } from "./artifact-validation";
import type { User } from "./types";
function toPublication(row: Row): WbsPublication {
  return { id: String(row.id), sequence: Number(row.sequence), sourceHash: String(row.source_hash),
    authorName: String(row.author_name), createdAt: String(row.created_at), snapshot: JSON.parse(String(row.snapshot_json)) };
}
export async function readWbsPublication(request: Request, user: User, projectId: string) {
  const tx = await db().transaction("read");
  let committed = false;
  try {
    const access = await projectAccess(tx, user, projectId);
    const row = (await tx.execute({ sql: "SELECT * FROM wbs_schedule_publications WHERE workspace_id=? AND project_id=? ORDER BY sequence DESC LIMIT 1", args: [user.workspaceId, projectId] })).rows[0];
    const canPublish = ["owner", "admin"].includes(String(access.role)) && (await projectPermissionAccess(tx,user,projectId)).permissionsByTab.wbs.UPDATE;
    await tx.commit();
    committed = true;
    await audit(request, { user, action: "READ", resource: "wbs_schedule_publication", resourceId: projectId });
    return { publication: row ? toPublication(row) : null, canPublish };
  } catch (error) { if (!committed) await tx.rollback(); throw error; }
  finally { tx.close(); }
}
export async function publishWbsSchedule(request: Request, user: User, projectId: string, input: Record<string, unknown>) {
  if (!input.versions || typeof input.versions !== "object" || Array.isArray(input.versions) ||
    Object.keys(input.versions).length > 10000 || Object.entries(input.versions).some(([id, version]) => !id || id.length > 100 || !Number.isSafeInteger(version) || Number(version) < 1))
    throw new HttpError(400, "배포할 저장본의 버전 정보를 확인해 주세요.");
  const tx = await db().transaction("write");
  try {
    const access = await projectAccess(tx, user, projectId, true);
    await requireProjectPermission(tx,user,projectId,"wbs","UPDATE");
    if (!["owner", "admin"].includes(String(access.role))) throw new HttpError(403, "프로젝트 owner/admin만 일정을 배포할 수 있습니다.");
    const data = await projectData(tx, user, projectId);
    const artifacts = data.artifacts.filter((artifact) => artifact.kind === "wbs");
    if (!artifacts.length) throw new HttpError(400, "배포할 저장된 일정이 없습니다.");
    const expected = Object.fromEntries(Object.entries(input.versions).sort(([a], [b]) => a.localeCompare(b)));
    const versions = scheduleVersions(artifacts);
    if (JSON.stringify(expected) !== JSON.stringify(versions)) throw new HttpError(409, "저장된 일정이 변경되었습니다. 최신 일정을 조회하고 다시 배포해 주세요.");
    // Validate the saved graph without rewriting or approving any task.
    for (const artifact of artifacts) prepareStructure(artifact, { structure: artifact.structure }, data.artifacts, artifact.structure);
    validateProjectGraph(data.artifacts);
    const sourceHash = createHash("sha256").update(JSON.stringify(versions)).digest("hex");
    const previous = (await tx.execute({ sql: "SELECT * FROM wbs_schedule_publications WHERE workspace_id=? AND project_id=? AND source_hash=?", args: [user.workspaceId, projectId, sourceHash] })).rows[0];
    if (previous) { await tx.commit(); return { publication: toPublication(previous), reused: true, canPublish: true }; }
    const sequence = Number((await tx.execute({ sql: "SELECT COALESCE(MAX(sequence),0)+1 AS next FROM wbs_schedule_publications WHERE workspace_id=? AND project_id=?", args: [user.workspaceId, projectId] })).rows[0].next);
    const publication: WbsPublication = { id: randomUUID(), sequence, sourceHash, authorName: user.name,
      createdAt: new Date().toISOString(), snapshot: { project: { id: projectId, name: data.project.name }, artifacts } };
    await tx.execute({ sql: "INSERT INTO wbs_schedule_publications(id,workspace_id,project_id,sequence,source_hash,snapshot_json,created_by,author_name,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      args: [publication.id, user.workspaceId, projectId, sequence, sourceHash, JSON.stringify(publication.snapshot), user.id, user.name, publication.createdAt] });
    await audit(request, { user, action: "CREATE", resource: "wbs_schedule_publication", resourceId: publication.id,
      metadata: { projectId, sequence, sourceHash, taskCount: artifacts.length } }, tx);
    await tx.commit();
    return { publication, reused: false, canPublish: true };
  } catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
}
