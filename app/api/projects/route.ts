import { toArtifact } from "@/lib/artifacts";
import { acceptanceReport } from "@/lib/integration";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
} from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Project } from "@/lib/project-types";
import { assertProjectCapacity, projectHistoryEnabled } from "@/lib/plans";
import { projectRoleSql } from "@/lib/team-permissions";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const result = await db().execute({
      sql: `SELECT p.id,p.name,p.description,p.status,p.created_at,p.owner_id,
        (SELECT COUNT(*) FROM project_artifacts a WHERE a.project_id=p.id AND a.workspace_id=p.workspace_id AND a.deleted_at IS NULL AND a.kind='requirement') AS requirement_count,
        (SELECT COUNT(*) FROM project_artifacts a WHERE a.project_id=p.id AND a.workspace_id=p.workspace_id AND a.deleted_at IS NULL AND a.kind='screen') AS screen_count,
        (SELECT COUNT(*) FROM project_artifacts a WHERE a.project_id=p.id AND a.workspace_id=p.workspace_id AND a.deleted_at IS NULL AND a.kind='program') AS program_count,
        (SELECT COUNT(*) FROM project_artifacts a WHERE a.project_id=p.id AND a.workspace_id=p.workspace_id AND a.deleted_at IS NULL AND a.kind='requirement' AND a.status='완료') AS completed_count,
        u.id AS member_id,u.name AS member_name,u.job_title,${projectRoleSql} AS role
        FROM projects p JOIN project_members own ON own.project_id=p.id AND own.workspace_id=p.workspace_id AND own.user_id=?
        JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id
        JOIN users u ON u.id=m.user_id JOIN workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id
        WHERE p.workspace_id=? ORDER BY p.created_at DESC,p.id,u.name,u.id`,
      args: [user.id, user.workspaceId],
    });
    const projects = new Map<string, Project>();
    for (const row of result.rows) {
      const id = String(row.id);
      if (!projects.has(id))
        projects.set(id, {
          id,
          ownerId: String(row.owner_id),
          name: String(row.name),
          description: String(row.description),
          status: String(row.status),
          createdAt: String(row.created_at),
          members: [],
          stats: {
            requirements: Number(row.requirement_count),
            screens: Number(row.screen_count),
            programs: Number(row.program_count),
            completed: Number(row.completed_count),
          },
        });
      projects.get(id)!.members.push({
        id: String(row.member_id),
        name: String(row.member_name),
        role: String(row.role),
        jobTitle: String(row.job_title),
      });
    }
    const documents = await db().execute({
      sql: `SELECT a.* FROM project_artifacts a JOIN project_members m ON m.project_id=a.project_id AND m.workspace_id=a.workspace_id AND m.user_id=? WHERE a.workspace_id=? AND a.deleted_at IS NULL`,
      args: [user.id, user.workspaceId],
    });
    const links = await db().execute({
      sql: `SELECT l.* FROM artifact_links l JOIN project_members m ON m.project_id=l.project_id AND m.workspace_id=l.workspace_id AND m.user_id=? WHERE l.workspace_id=? AND l.relation='reference'`,
      args: [user.id, user.workspaceId],
    });
    for (const project of projects.values()) {
      const artifacts = documents.rows
        .filter((row) => row.project_id === project.id)
        .map((row) =>
          toArtifact(
            row,
            links.rows
              .filter((e) => e.source_id === row.id)
              .map((e) => String(e.target_id)),
          ),
        );
      const report = acceptanceReport(artifacts);
      project.stats = {
        ...project.stats!,
        wbs: artifacts.filter((a) => a.kind === "wbs").length,
        architectures: artifacts.filter((a) => a.kind === "architecture")
          .length,
        databases: artifacts.filter((a) => a.kind === "database").length,
        tests: artifacts.filter((a) => a.kind === "test").length,
        wbsProgress: report.metrics.progress,
        plannedEffort: report.metrics.plannedEffort,
        actualEffort: report.metrics.actualEffort,
        acceptanceReady: report.ready,
        acceptanceIssues: report.issues.length,
      };
    }
    const recent = await db().execute({
      sql: `SELECT r.id,r.action,r.actor_name,r.occurred_at,r.snapshot_json,p.name AS project_name,p.id AS project_id FROM artifact_revisions r JOIN projects p ON p.id=r.project_id AND p.workspace_id=r.workspace_id JOIN project_members m ON m.project_id=r.project_id AND m.workspace_id=r.workspace_id AND m.user_id=? WHERE r.workspace_id=? ORDER BY r.occurred_at DESC,r.id DESC LIMIT 10`,
      args: [user.id, user.workspaceId],
    });
    const historyProjects = new Set<string>();
    for (const p of projects.values())
      if (await projectHistoryEnabled(p.id)) historyProjects.add(p.id);
    const activities = recent.rows
      .filter((row) => historyProjects.has(String(row.project_id)))
      .map((row) => ({
        id: String(row.id),
        action: String(row.action),
        actorName: String(row.actor_name),
        occurredAt: String(row.occurred_at),
        projectName: String(row.project_name),
        projectId: String(row.project_id),
        snapshot: JSON.parse(String(row.snapshot_json)),
      }));
    await audit(request, {
      user,
      action: "READ",
      resource: "projects",
      metadata: { returned: projects.size },
    });
    return Response.json(
      { projects: [...projects.values()], activities },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const data = await body(request);
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const description =
      typeof data.description === "string" ? data.description.trim() : "";
    if (!name || name.length > 100)
      throw new HttpError(400, "프로젝트 이름은 1~100자로 입력해 주세요.");
    if (typeof data.description !== "string" || description.length > 2000)
      throw new HttpError(400, "설명은 2,000자 이내로 입력해 주세요.");
    if (
      !Array.isArray(data.memberIds) ||
      data.memberIds.length > 100 ||
      data.memberIds.some((id) => typeof id !== "string" || id.length > 100)
    )
      throw new HttpError(
        400,
        "팀원 선택을 확인해 주세요. 한 번에 최대 100명을 선택할 수 있습니다.",
      );
    const memberIds = [...new Set<string>([user.id, ...data.memberIds])];
    if (memberIds.length > 100)
      throw new HttpError(
        400,
        "생성자를 포함해 최대 100명까지 추가할 수 있습니다.",
      );
    const tx = await db().transaction("write");
    try {
      await assertProjectCapacity(user.id, tx);
      const selected = await tx.execute({
        sql: `SELECT u.id,u.name,m.role FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND m.user_id IN (${memberIds.map(() => "?").join(",")}) ORDER BY u.name,u.id`,
        args: [user.workspaceId, ...memberIds],
      });
      if (selected.rows.length !== memberIds.length)
        throw new HttpError(400, "현재 팀에 속한 팀원만 추가할 수 있습니다.");
      const id = randomUUID(),
        createdAt = new Date().toISOString();
      await tx.execute({
        sql: "INSERT INTO projects(id,workspace_id,name,description,created_by,created_at,updated_at,owner_id) VALUES (?,?,?,?,?,?,?,?)",
        args: [
          id,
          user.workspaceId,
          name,
          description,
          user.id,
          createdAt,
          createdAt,
          user.id,
        ],
      });
      for (const memberId of memberIds)
        await tx.execute({
          sql: "INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES (?,?,?,?)",
          args: [
            id,
            user.workspaceId,
            memberId,
            memberId === user.id ? "admin" : "member",
          ],
        });
      await audit(
        request,
        {
          user,
          action: "CREATE",
          resource: "project",
          resourceId: id,
          after: { name, description, status: "진행 중", memberIds },
        },
        tx,
      );
      const project: Project = {
        id,
        ownerId: user.id,
        name,
        description,
        status: "진행 중",
        createdAt,
        members: selected.rows.map((row) => ({
          id: String(row.id),
          name: String(row.name),
          role: row.id === user.id ? "owner" : "member",
        })),
      };
      await tx.commit();
      return Response.json(
        { project },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  } catch (error) {
    return errorResponse(error);
  }
}
