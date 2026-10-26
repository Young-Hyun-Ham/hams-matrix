import { randomUUID } from "node:crypto";
import type { Client, Row } from "@libsql/client";
import { HttpError, requireWriter } from "./auth";
import { audit } from "./audit";
import { db } from "./db";
import type { User } from "./types";
import {
  allowedLinks,
  definitions,
  kinds,
  statuses,
  type Artifact,
  type ArtifactKind,
} from "./artifact-types";
import {
  prepareStructure,
  references,
  validateProjectGraph,
} from "./artifact-validation";
type Executor = Pick<Client, "execute">;
export async function projectAccess(
  executor: Executor,
  user: User,
  projectId: string,
  write = false,
) {
  const result = await executor.execute({
    sql: `SELECT p.id,p.name,p.description,p.status,w.role FROM projects p
      JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id
      JOIN workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id
      WHERE p.id=? AND p.workspace_id=? AND m.user_id=?`,
    args: [projectId, user.workspaceId, user.id],
  });
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "프로젝트를 찾을 수 없습니다.");
  if (write) requireWriter({ ...user, role: String(row.role) });
  return row;
}
export function toArtifact(row: Row, links: string[] = []): Artifact {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    kind: String(row.kind) as ArtifactKind,
    code: String(row.code),
    title: String(row.title),
    status: String(row.status),
    fields: JSON.parse(String(row.fields_json)),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    links,
    structure: JSON.parse(String(row.structure_json ?? "{}")),
  };
}
export async function projectData(
  executor: Executor,
  user: User,
  projectId: string,
) {
  const p = await projectAccess(executor, user, projectId);
  const result = await executor.execute({
    sql: "SELECT * FROM project_artifacts WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL ORDER BY code",
    args: [projectId, user.workspaceId],
  });
  const edges = await executor.execute({
    sql: "SELECT source_id,target_id FROM artifact_links WHERE project_id=? AND workspace_id=? AND relation='reference'",
    args: [projectId, user.workspaceId],
  });
  const revisions = await executor.execute({
    sql: "SELECT * FROM artifact_revisions WHERE project_id=? AND workspace_id=? ORDER BY occurred_at DESC,id DESC LIMIT 100",
    args: [projectId, user.workspaceId],
  });
  return {
    project: {
      id: String(p.id),
      name: String(p.name),
      description: String(p.description),
      status: String(p.status),
    },
    artifacts: result.rows.map((row) =>
      toArtifact(
        row,
        edges.rows
          .filter((e) => e.source_id === row.id)
          .map((e) => String(e.target_id)),
      ),
    ),
    revisions: revisions.rows.map((row) => ({
      id: String(row.id),
      artifactId: String(row.artifact_id),
      version: Number(row.version),
      action: String(row.action),
      actorName: String(row.actor_name),
      occurredAt: String(row.occurred_at),
      snapshot: JSON.parse(String(row.snapshot_json)) as Artifact,
    })),
    canWrite:
      user.accountRole === "owner" &&
      ["owner", "admin", "member"].includes(String(p.role)),
  };
}
function validate(input: Record<string, unknown>, kind: ArtifactKind) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 200)
    throw new HttpError(400, "명칭은 1~200자로 입력해 주세요.");
  if (!statuses.includes(input.status as (typeof statuses)[number]))
    throw new HttpError(400, "상태를 확인해 주세요.");
  if (
    !input.fields ||
    typeof input.fields !== "object" ||
    Array.isArray(input.fields)
  )
    throw new HttpError(400, "입력 항목을 확인해 주세요.");
  const raw = input.fields as Record<string, unknown>,
    fields: Record<string, string> = {};
  for (const field of definitions[kind].fields) {
    const value = raw[field.key] ?? "";
    if (
      typeof value !== "string" ||
      value.length > 3000 ||
      (field.required && !value.trim()) ||
      (field.options && value !== "" && !field.options.includes(value))
    )
      throw new HttpError(
        400,
        `${field.label} 항목을 확인해 주세요. (최대 3,000자)`,
      );
    if (
      value &&
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      throw new HttpError(400, `${field.label} 날짜를 확인해 주세요.`);
    if (
      value &&
      field.type === "number" &&
      (!/^\d+(\.\d+)?$/.test(value) ||
        !Number.isFinite(Number(value)) ||
        Number(value) > 1000000)
    )
      throw new HttpError(
        400,
        `${field.label}은 0~1,000,000의 수로 입력해 주세요.`,
      );
    fields[field.key] = value.trim();
  }
  if (
    !Array.isArray(input.links) ||
    input.links.length > 200 ||
    input.links.some((x) => typeof x !== "string" || x.length > 100)
  )
    throw new HttpError(400, "연결 항목을 확인해 주세요.");
  return {
    title,
    status: input.status as string,
    fields,
    links: [...new Set(input.links as string[])],
  };
}
export async function mutateArtifact(
  request: Request,
  user: User,
  projectId: string,
  input: Record<string, unknown>,
  action: "CREATE" | "UPDATE" | "DELETE",
  id?: string,
) {
  const tx = await db().transaction("write");
  try {
    await projectAccess(tx, user, projectId, true);
    let before: Artifact | undefined;
    if (id) {
      const found = await tx.execute({
        sql: "SELECT * FROM project_artifacts WHERE id=? AND project_id=? AND workspace_id=? AND deleted_at IS NULL",
        args: [id, projectId, user.workspaceId],
      });
      if (!found.rows[0]) throw new HttpError(404, "항목을 찾을 수 없습니다.");
      const edges = await tx.execute({
        sql: "SELECT target_id FROM artifact_links WHERE source_id=? AND project_id=? AND workspace_id=? AND relation='reference'",
        args: [id, projectId, user.workspaceId],
      });
      before = toArtifact(
        found.rows[0],
        edges.rows.map((e) => String(e.target_id)),
      );
      if (!Number.isInteger(input.version) || input.version !== before.version)
        throw new HttpError(
          409,
          "다른 사용자가 변경했습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.",
        );
    }
    const kind = before?.kind ?? (input.kind as ArtifactKind);
    if (!kinds.includes(kind))
      throw new HttpError(400, "항목 유형을 확인해 주세요.");
    const now = new Date().toISOString();
    let after: Artifact;
    if (action === "DELETE") {
      const edges = await tx.execute({
        sql: "SELECT source_id FROM artifact_links WHERE (source_id=? OR target_id=?) AND project_id=? AND workspace_id=? LIMIT 1",
        args: [id!, id!, projectId, user.workspaceId],
      });
      if (edges.rows.length)
        throw new HttpError(
          409,
          "연결된 항목이 있습니다. 관련 항목의 연결을 먼저 해제해 주세요.",
        );
      await tx.execute({
        sql: "UPDATE project_artifacts SET deleted_at=?,updated_at=?,updated_by=?,version=version+1 WHERE id=? AND project_id=? AND workspace_id=?",
        args: [now, now, user.id, id!, projectId, user.workspaceId],
      });
      after = { ...before!, version: before!.version + 1, updatedAt: now };
    } else {
      const values = validate(input, kind);
      if (
        before?.kind === "requirement" &&
        values.fields.category !== before.fields.category
      )
        throw new HttpError(
          400,
          "관리번호 보존을 위해 등록 후 분류는 변경할 수 없습니다.",
        );
      for (const targetId of values.links) {
        if (targetId === id)
          throw new HttpError(400, "자기 자신을 연결할 수 없습니다.");
        const target = await tx.execute({
          sql: "SELECT kind FROM project_artifacts WHERE id=? AND project_id=? AND workspace_id=? AND deleted_at IS NULL",
          args: [targetId, projectId, user.workspaceId],
        });
        const targetKind = target.rows[0]?.kind;
        if (
          !targetKind ||
          !allowedLinks[kind].includes(targetKind as ArtifactKind)
        )
          throw new HttpError(
            400,
            "같은 프로젝트의 유효한 상위 항목만 연결할 수 있습니다.",
          );
      }
      let code = before?.code;
      if (!code) {
        const prefix =
          kind === "requirement"
            ? values.fields.category
            : definitions[kind].prefix;
        const counter = await tx.execute({
          sql: "INSERT INTO project_sequences(project_id,prefix,value) VALUES (?,?,1) ON CONFLICT(project_id,prefix) DO UPDATE SET value=value+1 RETURNING value",
          args: [projectId, prefix],
        });
        code = `${prefix}-${String(counter.rows[0].value).padStart(3, "0")}`;
      }
      const artifactId = before?.id ?? randomUUID();
      after = {
        id: artifactId,
        projectId,
        kind,
        code,
        ...values,
        version: (before?.version ?? 0) + 1,
        createdAt: before?.createdAt ?? now,
        updatedAt: now,
      };
      const projectRows = await tx.execute({
        sql: "SELECT * FROM project_artifacts WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL",
        args: [projectId, user.workspaceId],
      });
      const projectEdges = await tx.execute({
        sql: "SELECT source_id,target_id FROM artifact_links WHERE project_id=? AND workspace_id=? AND relation='reference'",
        args: [projectId, user.workspaceId],
      });
      const all = projectRows.rows.map((row) =>
        toArtifact(
          row,
          projectEdges.rows
            .filter((e) => e.source_id === row.id)
            .map((e) => String(e.target_id)),
        ),
      );
      const candidate = [...all.filter((a) => a.id !== after.id), after];
      after.structure = prepareStructure(after, input, candidate);
      validateProjectGraph(candidate);
      if (before)
        await tx.execute({
          sql: "UPDATE project_artifacts SET title=?,status=?,fields_json=?,structure_json=?,version=?,updated_by=?,updated_at=? WHERE id=? AND project_id=? AND workspace_id=?",
          args: [
            after.title,
            after.status,
            JSON.stringify(after.fields),
            JSON.stringify(after.structure),
            after.version,
            user.id,
            now,
            artifactId,
            projectId,
            user.workspaceId,
          ],
        });
      else
        await tx.execute({
          sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          args: [
            artifactId,
            user.workspaceId,
            projectId,
            kind,
            code,
            after.title,
            after.status,
            JSON.stringify(after.fields),
            JSON.stringify(after.structure),
            1,
            user.id,
            user.id,
            now,
            now,
          ],
        });
      await tx.execute({
        sql: "DELETE FROM artifact_links WHERE source_id=? AND project_id=? AND workspace_id=?",
        args: [artifactId, projectId, user.workspaceId],
      });
      for (const { targetId, relation } of references(after))
        await tx.execute({
          sql: "INSERT INTO artifact_links(source_id,target_id,project_id,workspace_id,relation) VALUES (?,?,?,?,?)",
          args: [artifactId, targetId, projectId, user.workspaceId, relation],
        });
    }
    await tx.execute({
      sql: "INSERT INTO artifact_revisions(id,artifact_id,project_id,workspace_id,version,action,actor_id,actor_name,snapshot_json,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      args: [
        randomUUID(),
        after.id,
        projectId,
        user.workspaceId,
        after.version,
        action,
        user.id,
        user.name,
        JSON.stringify(after),
        now,
      ],
    });
    await audit(
      request,
      {
        user,
        action,
        resource: kind,
        resourceId: after.id,
        before: before
          ? {
              title: before.title,
              status: before.status,
              version: before.version,
              code: before.code,
              fields: before.fields,
              links: before.links,
              structure: before.structure,
            }
          : undefined,
        after:
          action === "DELETE"
            ? undefined
            : {
                title: after.title,
                status: after.status,
                version: after.version,
                code: after.code,
                fields: after.fields,
                links: after.links,
                structure: after.structure,
              },
        metadata: { projectId },
      },
      tx,
    );
    await tx.commit();
    return after;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    tx.close();
  }
}
