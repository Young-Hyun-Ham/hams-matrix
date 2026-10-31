import { requireProjectPermission } from "./project-permissions";
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./auth";
import type { User } from "./types";
import type { Artifact } from "./artifact-types";
import { allowedLinks } from "./artifact-types";
import { persistArtifactRow, syncArtifactLinks, recordArtifactChange, projectAccess, projectData, validateArtifactInput } from "./artifacts";
import { prepareStructure, references, validateProjectGraph } from "./artifact-validation";
import { aggregateSchedule, scheduleContent } from "./wbs-schedule";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "저장 요청을 확인해 주세요.");
  return value as Record<string, unknown>;
}
export async function saveWbsSchedule(request: Request, user: User, projectId: string, input: Record<string, unknown>) {
  if (typeof input.requestId !== "string" || !/^[\w-]{16,100}$/.test(input.requestId) || !Array.isArray(input.changes) || !Array.isArray(input.deletes) || input.changes.length + input.deletes.length > 500)
    throw new HttpError(400, "저장 요청 ID와 변경 목록을 확인해 주세요. (최대 500건)");
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const tx = await db().transaction("write");
  try {
    await projectAccess(tx, user, projectId, true);
    const receipt = (await tx.execute({ sql: "SELECT input_hash,response_json FROM wbs_schedule_requests WHERE workspace_id=? AND project_id=? AND user_id=? AND request_id=?",
      args: [user.workspaceId, projectId, user.id, input.requestId] })).rows[0];
    if (receipt) {
      if (receipt.input_hash !== inputHash) throw new HttpError(409, "동일 요청 ID에 다른 변경사항을 사용할 수 없습니다.");
      const result = { ...JSON.parse(String(receipt.response_json)), data: await projectData(tx, user, projectId) };
      await tx.commit();
      return result;
    }
    const data = await projectData(tx, user, projectId);
    const original = new Map(data.artifacts.map((artifact) => [artifact.id, artifact]));
    const changed = new Map<string, Artifact>();
    const removed = new Set<string>();
    const idMap: Record<string, string> = Object.create(null);
    const used = new Set<string>();
    const now = new Date().toISOString();
    const changes = input.changes.map(record), deletes = input.deletes.map(record);
    function identify(raw: Record<string, unknown>, deleting = false) {
      if (typeof raw.id !== "string" || raw.id.length > 100 || used.has(raw.id)) throw new HttpError(400, "중복되거나 잘못된 작업 ID입니다.");
      used.add(raw.id);
      const before = original.get(raw.id);
      if (before) {
        if (before.kind !== "wbs") throw new HttpError(400, "WBS 일정만 변경할 수 있습니다.");
        if (!Number.isInteger(raw.version) || raw.version !== before.version) throw new HttpError(409, `${before.code} 작업이 변경되었습니다. 최신 내용을 조회해 주세요.`);
      } else if (deleting || !raw.id.startsWith("temp-") || raw.version !== undefined) {
        throw new HttpError(409, "작업이 삭제되었거나 다른 프로젝트의 작업입니다. 최신 내용을 조회해 주세요.");
      }
      return before;
    }
    for (const raw of deletes) { await requireProjectPermission(tx,user,projectId,"wbs","DELETE"); identify(raw, true); removed.add(raw.id as string); }
    for (const raw of changes) {
      const before = identify(raw);
      await requireProjectPermission(tx,user,projectId,"wbs",before ? "UPDATE" : "CREATE");
      idMap[raw.id as string] = before?.id ?? randomUUID();
    }
    const remap = (value: unknown) => typeof value === "string" ? idMap[value] ?? value : value;
    for (const raw of changes) {
      const before = original.get(raw.id as string);
      const fields = { ...before?.fields, ...record(raw.fields) };
      const values = validateArtifactInput({ ...raw, fields, links: raw.links ?? before?.links ?? [] }, "wbs", before);
      let code = before?.code;
      if (!code) {
        const counter = await tx.execute({ sql: "INSERT INTO project_sequences(project_id,prefix,value) VALUES (?,'WBS',1) ON CONFLICT(project_id,prefix) DO UPDATE SET value=value+1 RETURNING value", args: [projectId] });
        code = `WBS-${String(counter.rows[0].value).padStart(3, "0")}`;
      }
      const rawStructure = { ...before?.structure, ...(raw.structure === undefined ? {} : record(raw.structure)) };
      const dependencies = rawStructure.dependencies;
      if (dependencies !== undefined && !Array.isArray(dependencies)) throw new HttpError(400, "선행 작업 목록을 확인해 주세요.");
      const after: Artifact = { id: idMap[raw.id as string], projectId, kind: "wbs", code, ...values,
        structure: { ...rawStructure, parentId: remap(rawStructure.parentId ?? "") as string,
          dependencies: (dependencies as unknown[] ?? []).map(remap) as string[] },
        version: (before?.version ?? 0) + 1, createdAt: before?.createdAt ?? now, updatedAt: now };
      changed.set(after.id, after);
    }
    let candidate = [...data.artifacts.filter((artifact) => !removed.has(artifact.id) && !changed.has(artifact.id)), ...changed.values()];
    // Cycle/target checks must precede recursive summary aggregation.
    for (const artifact of candidate.filter((artifact) => artifact.kind === "wbs")) {
      for (const ref of references(artifact)) {
        if (!candidate.some((target) => target.id === ref.targetId)) throw new HttpError(409, `${artifact.code}에서 참조하는 작업을 삭제할 수 없습니다.`);
      }
    }
    try { candidate = aggregateSchedule(candidate); }
    catch { throw new HttpError(400, "작업 계층에 순환이 있습니다."); }
    for (const artifact of candidate.filter((artifact) => artifact.kind === "wbs")) {
      const before = original.get(artifact.id);
      if (before && !changed.has(artifact.id) && scheduleContent(before) === scheduleContent(artifact)) continue;
      // Automatically updated summaries also retain optimistic concurrency protection.
      if (before && !changed.has(artifact.id)) {
        await requireProjectPermission(tx,user,projectId,"wbs","UPDATE");
        const versions = record(input.versions ?? {});
        if (versions[artifact.id] !== before.version) throw new HttpError(409, `${artifact.code} 요약 작업이 변경되었습니다. 최신 내용을 조회해 주세요.`);
        artifact.version = before.version + 1;
        artifact.updatedAt = now;
      }
      artifact.structure = prepareStructure(artifact, { structure: artifact.structure }, candidate, before?.structure);
      for (const id of artifact.links) {
        const target = candidate.find((target) => target.id === id);
        if (id === artifact.id || !target || !allowedLinks.wbs.includes(target.kind)) throw new HttpError(400, "연결할 산출물을 확인해 주세요.");
      }
      if (!before || scheduleContent(before) !== scheduleContent(artifact)) changed.set(artifact.id, artifact);
      else changed.delete(artifact.id);
    }
    for (const artifact of candidate) {
      for (const ref of references(artifact)) if (removed.has(ref.targetId)) throw new HttpError(409, `${artifact.code}에서 참조 중인 작업은 삭제할 수 없습니다.`);
    }
    for (const id of removed) {
      if (original.get(id)!.links.length) throw new HttpError(409, "삭제할 작업의 산출물 연결을 먼저 해제해 주세요.");
    }
    validateProjectGraph(candidate);
    // Rows first: new parent/dependency IDs may refer to another new row.
    for (const artifact of changed.values()) await persistArtifactRow(tx, user, artifact, original.get(artifact.id), original.has(artifact.id) ? "UPDATE" : "CREATE");
    for (const id of removed) {
      await tx.execute({ sql: "DELETE FROM artifact_links WHERE source_id=? AND project_id=? AND workspace_id=?", args: [id, projectId, user.workspaceId] });
    }
    for (const artifact of changed.values()) await syncArtifactLinks(tx, user, artifact);
    for (const id of removed) {
      const before = original.get(id)!;
      const after = { ...before, version: before.version + 1, updatedAt: now };
      await persistArtifactRow(tx, user, after, before, "DELETE");
      await recordArtifactChange(tx, request, user, after, before, "DELETE");
    }
    for (const artifact of changed.values()) await recordArtifactChange(tx, request, user, artifact, original.get(artifact.id), original.has(artifact.id) ? "UPDATE" : "CREATE");
    const result = { data: await projectData(tx, user, projectId), idMap, savedAt: now };
    await tx.execute({ sql: "INSERT INTO wbs_schedule_requests(workspace_id,project_id,user_id,request_id,input_hash,response_json,created_at) VALUES (?,?,?,?,?,?,?)",
      args: [user.workspaceId, projectId, user.id, input.requestId, inputHash, JSON.stringify({ idMap, savedAt: now }), now] });
    await tx.commit();
    return result;
  } catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
}
