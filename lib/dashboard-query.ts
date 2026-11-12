import "server-only";
import type { Client } from "@libsql/client";
import { db } from "./db";
import { HttpError } from "./auth";
import { toArtifact } from "./artifacts";
import { kinds } from "./artifact-types";
import { projectPermissionAccess } from "./project-permissions";
import { projectHistoryEnabled, workspacePlan } from "./plans";
import {
  dashboardPreview,
  dashboardProjectStats,
  dashboardRange,
} from "./dashboard-model";
import type {
  DashboardData,
  DashboardProject,
  DashboardActivity,
} from "./dashboard-types";
import type { ProjectTab } from "./project-tabs";
import type { User } from "./types";

export async function dashboardData(
  user: User,
  selected = "",
  client: Client = db(),
  now = new Date(),
): Promise<DashboardData> {
  const range = dashboardRange(now);
  const tx = await client.transaction("read");
  try {
    await workspacePlan(user.id, user.workspaceId, tx);
    // Project permission access deliberately excludes guests in the existing server policy.
    const rows =
      user.accountRole === "guest" || !user.onboardingComplete
        ? []
        : (
            await tx.execute({
              sql: `SELECT p.id,p.name,p.description,p.status,
        (SELECT COUNT(*) FROM project_members pm JOIN workspace_members wm ON wm.workspace_id=pm.workspace_id AND wm.user_id=pm.user_id WHERE pm.project_id=p.id AND pm.workspace_id=p.workspace_id) AS member_count
        FROM projects p JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id AND m.user_id=?
        JOIN workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id
        WHERE p.workspace_id=? ORDER BY p.created_at DESC,p.id`,
              args: [user.id, user.workspaceId],
            })
          ).rows;
    if (selected && !rows.some((p) => p.id === selected))
      throw new HttpError(404, "프로젝트를 찾을 수 없습니다.");
    const options: DashboardData["projectOptions"] = [];
    const projects: DashboardProject[] = [];
    const historyProjects: DashboardProject[] = [];
    for (const row of rows) {
      const id = String(row.id);
      const access = await projectPermissionAccess(tx, user, id);
      const historyEnabled = await projectHistoryEnabled(id, tx);
      const readableTabs = (
        Object.keys(access.permissionsByTab) as ProjectTab[]
      ).filter(
        (tab) =>
          access.permissionsByTab[tab].READ &&
          (tab !== "history" || historyEnabled),
      );
      options.push({ id, name: String(row.name), readableTabs });
      if (selected && id !== selected) continue;
      const project: DashboardProject = {
        id,
        name: String(row.name),
        description: String(row.description),
        status: String(row.status),
        memberCount: Number(row.member_count),
        readableTabs,
        completeScope: kinds.every((kind) => readableTabs.includes(kind)),
      };
      projects.push(project);
      if (
        historyEnabled &&
        readableTabs.includes("history") &&
        kinds.some((kind) => readableTabs.includes(kind))
      )
        historyProjects.push(project);
    }
    const artifactsResult = projects.length
      ? await tx.execute({
          sql: `SELECT a.* FROM project_artifacts a JOIN project_members m ON m.project_id=a.project_id AND m.workspace_id=a.workspace_id AND m.user_id=? WHERE a.workspace_id=? AND a.deleted_at IS NULL${selected ? " AND a.project_id=?" : ""}`,
          args: [user.id, user.workspaceId, ...(selected ? [selected] : [])],
        })
      : { rows: [] };
    const linksResult = projects.length
      ? await tx.execute({
          sql: `SELECT l.project_id,l.source_id,l.target_id FROM artifact_links l JOIN project_members m ON m.project_id=l.project_id AND m.workspace_id=l.workspace_id AND m.user_id=? WHERE l.workspace_id=? AND l.relation='reference'${selected ? " AND l.project_id=?" : ""}`,
          args: [user.id, user.workspaceId, ...(selected ? [selected] : [])],
        })
      : { rows: [] };
    const edgeMap = new Map<string, string[]>();
    for (const edge of linksResult.rows) {
      const key = `${edge.project_id}:${edge.source_id}`;
      const list = edgeMap.get(key) ?? [];
      list.push(String(edge.target_id));
      edgeMap.set(key, list);
    }
    const artifacts = artifactsResult.rows.map((row) =>
      toArtifact(row, edgeMap.get(`${row.project_id}:${row.id}`) ?? []),
    );
    for (const p of projects) {
      const visible = artifacts.filter(
        (a) => a.projectId === p.id && p.readableTabs.includes(a.kind),
      );
      p.stats = dashboardProjectStats(
        visible,
        p.completeScope && p.readableTabs.includes("acceptance"),
        range.endDate,
      );
    }
    let recentChanges: number | null = historyProjects.length
      ? 0
      : projects.length
        ? null
        : 0;
    let recentActivities: DashboardActivity[] = [];
    if (historyProjects.length) {
      const args = [user.workspaceId];
      // Group identical READ scopes instead of one OR expression per project.
      const groups = new Map<string, { ids: string[]; readable: string[] }>();
      for (const p of historyProjects) {
        const readable = kinds.filter((kind) => p.readableTabs.includes(kind));
        const key = readable.join(",");
        const group = groups.get(key) ?? { ids: [], readable };
        group.ids.push(p.id);
        groups.set(key, group);
      }
      const clauses = [...groups.values()].map(({ ids, readable }) => {
        args.push(...ids, ...readable);
        return `(r.project_id IN (${ids.map(() => "?").join(",")}) AND json_extract(r.snapshot_json,'$.kind') IN (${readable.map(() => "?").join(",")}))`;
      });
      const where = `r.workspace_id=? AND (${clauses.join(" OR ")}) AND r.occurred_at<=?`;
      const count = await tx.execute({
        sql: `SELECT COUNT(*) AS total FROM artifact_revisions r WHERE ${where} AND r.action='UPDATE' AND r.occurred_at>=? AND r.occurred_at<?`,
        args: [...args, range.asOf, range.start, range.end],
      });
      recentChanges = Number(count.rows[0].total);
      const recent = await tx.execute({
        sql: `SELECT r.id,r.project_id,r.action,r.actor_name,r.occurred_at,json_extract(r.snapshot_json,'$.kind') AS kind,json_extract(r.snapshot_json,'$.code') AS code,json_extract(r.snapshot_json,'$.title') AS title FROM artifact_revisions r WHERE ${where} ORDER BY r.occurred_at DESC,r.id DESC LIMIT 10`,
        args: [...args, range.asOf],
      });
      recentActivities = recent.rows.map((r) => ({
        id: String(r.id),
        projectId: String(r.project_id),
        projectName: projects.find((p) => p.id === r.project_id)!.name,
        kind: String(r.kind) as DashboardActivity["kind"],
        code: String(r.code),
        title: String(r.title),
        action: String(r.action),
        actorName: String(r.actor_name),
        occurredAt: String(r.occurred_at),
      }));
    }
    const preview = dashboardPreview(projects, artifacts);
    const result: DashboardData = {
      selectedProjectId: selected || null,
      projectOptions: options,
      projects,
      summary: {
        projects: projects.length,
        artifacts: preview.artifacts,
        reviewing: preview.reviewing,
        recentChanges,
        historyLimited:
          historyProjects.length < projects.length ||
          projects.some((p) => !p.completeScope),
        scopeLimited: projects.some((p) => !p.completeScope),
      },
      recentArtifacts: preview.recentArtifacts,
      impactPreview: preview.impactPreview,
      recentActivities,
      range,
    };
    await tx.commit();
    return result;
  } finally {
    tx.close();
  }
}
