import "server-only";
import type { User } from "../types";
import type { AiContext } from "../ai-context";
import type { AiPage } from "./page-prompts";
import { db } from "../db";
import { projectAccess, toArtifact } from "../artifacts";
import { acceptanceReport } from "../integration";

export async function readAiPage(user: User, context: AiContext, page: AiPage) {
  if (page.source === "dashboard") {
    const projects = await db().execute({
      sql: "SELECT p.id,p.name,p.description,p.status FROM projects p JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id WHERE p.workspace_id=? AND m.user_id=? ORDER BY p.updated_at DESC LIMIT 100",
      args: [user.workspaceId, user.id],
    });
    return {
      projects: projects.rows.map((row) => ({
        ...row,
        description: String(row.description).slice(0, 300),
      })),
      scope: "접근 가능한 프로젝트 최근 100개",
    };
  }
  if (page.source === "team") {
    const members = await db().execute({
      sql: "SELECT u.id,u.name,u.job_title AS jobTitle,m.role FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.name LIMIT 100",
      args: [user.workspaceId],
    });
    const owner = user.role === "owner";
    const requests = await db().execute({
      sql: `SELECT r.id,r.status,r.requested_at,u.name,w.name AS team_name FROM team_join_requests r JOIN users u ON u.id=r.user_id JOIN workspaces w ON w.id=r.workspace_id WHERE ${owner ? "r.workspace_id=? AND w.owner_id=?" : "r.user_id=?"} ORDER BY r.requested_at DESC LIMIT 100`,
      args: owner ? [user.workspaceId, user.id] : [user.id],
    });
    const posts = await db().execute({ sql: "SELECT t.id,t.title,t.body,t.category,t.created_at,u.name AS author FROM team_posts t JOIN users u ON u.id=t.author_id WHERE t.workspace_id=? AND (t.project_id IS NULL OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=t.project_id AND m.workspace_id=t.workspace_id AND m.user_id=?)) ORDER BY t.created_at DESC,t.id DESC LIMIT 20", args: [user.workspaceId, user.id] });
    return { members: members.rows, requests: requests.rows, posts: posts.rows.map(row => ({ ...row, body: String(row.body).slice(0, 2000) })) };
  }
  if (!context.projectId)
    return { message: "프로젝트를 먼저 선택해 주세요.", artifacts: [] };
  const project = await projectAccess(db(), user, context.projectId);
  const projectInfo = {
    id: String(project.id),
    name: String(project.name),
    description: String(project.description),
  };
  if (page.source === "history") {
    const revisions = await db().execute({
      sql: "SELECT id,artifact_id,version,action,actor_name,occurred_at,snapshot_json FROM artifact_revisions WHERE project_id=? AND workspace_id=? ORDER BY occurred_at DESC,id DESC LIMIT 50",
      args: [context.projectId, user.workspaceId],
    });
    return {
      project: projectInfo,
      revisions: revisions.rows.map((row) => ({
        id: row.id,
        artifactId: row.artifact_id,
        version: row.version,
        action: row.action,
        actorName: row.actor_name,
        occurredAt: row.occurred_at,
        snapshot:
          String(row.snapshot_json).length < 1000
            ? JSON.parse(String(row.snapshot_json))
            : {
                code: JSON.parse(String(row.snapshot_json)).code,
                title: JSON.parse(String(row.snapshot_json)).title,
                detailsOmitted: true,
              },
      })),
      scope: "최근 50개 이력",
    };
  }
  const rows = await db().execute({
    sql: `SELECT * FROM project_artifacts WHERE project_id=? AND workspace_id=? AND deleted_at IS NULL AND kind IN (${page.reads.map(() => "?").join(",")}) ORDER BY CASE WHEN kind=? THEN 0 ELSE 1 END,code`,
    args: [context.projectId, user.workspaceId, ...page.reads, page.kind ?? ""],
  });
  const edges = await db().execute({
    sql: "SELECT source_id,target_id,relation FROM artifact_links WHERE project_id=? AND workspace_id=?",
    args: [context.projectId, user.workspaceId],
  });
  const artifacts = rows.rows.map((row) =>
    toArtifact(
      row,
      edges.rows
        .filter(
          (edge) => edge.source_id === row.id && edge.relation === "reference",
        )
        .map((edge) => String(edge.target_id)),
    ),
  );
  const ids = new Set(artifacts.map((a) => a.id));
  // 검수 계산은 자료를 줄이기 전의 프로젝트 전체 항목을 기준으로 수행합니다.
  const report = ["acceptance", "overview", "export"].includes(page.key)
    ? acceptanceReport(artifacts)
    : undefined;
  let budget = 50000;
  const selected = artifacts.filter((a) => {
    const size = JSON.stringify(a).length;
    if (size > budget) return false;
    budget -= size;
    return true;
  });
  return {
    project: projectInfo,
    artifacts: selected,
    links: edges.rows
      .filter(
        (edge) =>
          ids.has(String(edge.source_id)) && ids.has(String(edge.target_id)),
      )
      .slice(0, 200),
    report,
    total: artifacts.length,
    truncated: selected.length < artifacts.length,
    scope: "현재 탭 및 관련 문서. 긴 자료는 생략될 수 있음",
  };
}
