import { requireUser, errorResponse, body, checkOrigin, HttpError, emailInput, rateLimit } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { connection } from "next/server";
import { projectAccess } from "@/lib/artifacts";
import { projectRoleSql, requireProjectOwner, requireTeamOwner } from "@/lib/team-permissions";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const projectId = new URL(request.url).searchParams.get("projectId") || "";
    const access = projectId ? await projectAccess(db(), user, projectId) : null;
    const result = await db().execute({
      sql: projectId ? `SELECT u.id,u.name,u.job_title,${projectRoleSql} AS role FROM projects p JOIN project_members m ON m.project_id=p.id AND m.workspace_id=p.workspace_id JOIN workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id JOIN users u ON u.id=m.user_id WHERE p.workspace_id=? AND p.id=? ORDER BY u.name,u.id` : "SELECT u.id,u.name,u.job_title,m.role FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.name,u.id",
      args: projectId ? [user.workspaceId, projectId] : [user.workspaceId],
    });
    const members = result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      role: String(row.role),
      jobTitle: String(row.job_title),
    }));
    await audit(request, {
      user,
      action: "READ",
      resource: "workspace_members",
      metadata: { returned: members.length },
    });
    return Response.json(
      { members, canAdd: access ? ["owner", "admin"].includes(String(access.role)) : false, canManage: access ? access.owner_id === user.id : user.role === "owner", ownerId: access ? String(access.owner_id) : members.find(member => member.role === "owner")?.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser(), data = await body(request);
    const email = emailInput(data.email), projectId = typeof data.projectId === "string" ? data.projectId : "";
    if (!projectId) throw new HttpError(400, "멤버를 추가할 프로젝트를 선택해 주세요.");
    await rateLimit(`team-add:${user.workspaceId}:${user.id}`, 30);
    const tx = await db().transaction("write");
    try {
      const access = await projectAccess(tx, user, projectId);
      if (!["owner", "admin"].includes(String(access.role))) throw new HttpError(403, "선택한 프로젝트의 owner 또는 admin만 멤버를 추가할 수 있습니다.");
      const target = (await tx.execute({ sql: "SELECT id FROM users WHERE email=? AND account_role='user' AND onboarding_complete=1", args: [email] })).rows[0];
      if (!target) throw new HttpError(404, "추가할 수 있는 Free 사용자를 찾을 수 없습니다. 가입한 이메일을 확인해 주세요.");
      const id = String(target.id);
      const exists = (await tx.execute({ sql: projectId ? "SELECT user_id FROM project_members WHERE project_id=? AND workspace_id=? AND user_id=?" : "SELECT user_id FROM workspace_members WHERE workspace_id=? AND user_id=?", args: projectId ? [projectId, user.workspaceId, id] : [user.workspaceId, id] })).rows[0];
      if (exists) throw new HttpError(409, "이미 구성원인 사용자입니다. 권한 변경을 이용해 주세요.");
      await tx.execute({ sql: "INSERT INTO workspace_members(workspace_id,user_id,role,join_source) VALUES (?,?,'viewer',?) ON CONFLICT(workspace_id,user_id) DO NOTHING", args: [user.workspaceId, id, projectId ? "project" : "direct"] });
      await tx.execute({ sql: "INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES (?,?,?,'viewer')", args: [projectId, user.workspaceId, id] });
      await tx.execute({ sql: "UPDATE users SET active_workspace_id=?,updated_at=? WHERE id=?", args: [user.workspaceId, new Date().toISOString(), id] });
      await tx.execute({ sql: "UPDATE sessions SET workspace_id=? WHERE user_id=? AND revoked_at IS NULL", args: [user.workspaceId, id] });
      await audit(request, { user, action: "CREATE", resource: "workspace_member", resourceId: id, after: { role: "viewer" }, metadata: { projectId, source: "direct" } }, tx);
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; } finally { tx.close(); }
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser(), data = await body(request);
    const projectId = typeof data.projectId === "string" ? data.projectId : "";
    if (typeof data.userId !== "string" || !["owner", "admin", "member", "viewer"].includes(String(data.role))) throw new HttpError(400, "구성원과 변경할 권한을 확인해 주세요.");
    const tx = await db().transaction("write");
    try {
      if (projectId) await requireProjectOwner(tx, user, projectId); else await requireTeamOwner(tx, user);
      const target = (await tx.execute({ sql: projectId ? `SELECT ${projectRoleSql} AS role,p.owner_id FROM project_members m JOIN projects p ON p.id=m.project_id AND p.workspace_id=m.workspace_id JOIN workspace_members w ON w.workspace_id=m.workspace_id AND w.user_id=m.user_id WHERE m.project_id=? AND m.workspace_id=? AND m.user_id=?` : "SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?", args: projectId ? [projectId, user.workspaceId, data.userId] : [user.workspaceId, data.userId] })).rows[0];
      if (!target) throw new HttpError(404, "구성원을 찾을 수 없습니다.");
      if (data.role === "owner") {
        if (data.confirmTransfer !== true || typeof data.expectedOwnerId !== "string" || data.expectedOwnerId !== user.id) throw new HttpError(409, "현재 소유자를 확인하고 소유권 양도를 승인해 주세요.");
        if (data.userId === user.id) throw new HttpError(400, "현재 소유자에게 다시 양도할 수 없습니다.");
        if (projectId) {
          await tx.execute({ sql: "UPDATE project_members SET role='member' WHERE project_id=? AND user_id=?", args: [projectId, user.id] });
          await tx.execute({ sql: "UPDATE projects SET owner_id=?,updated_at=? WHERE id=? AND workspace_id=? AND owner_id=?", args: [data.userId, new Date().toISOString(), projectId, user.workspaceId, user.id] });
        } else {
          await tx.execute({ sql: "UPDATE workspace_members SET role='member' WHERE workspace_id=? AND user_id=?", args: [user.workspaceId, user.id] });
          await tx.execute({ sql: "UPDATE workspace_members SET role='owner' WHERE workspace_id=? AND user_id=?", args: [user.workspaceId, data.userId] });
          await tx.execute({ sql: "UPDATE workspaces SET owner_id=? WHERE id=? AND owner_id=?", args: [data.userId, user.workspaceId, user.id] });
        }
      } else {
        if (projectId ? target.owner_id === data.userId : target.role === "owner") throw new HttpError(400, "owner는 직접 해제할 수 없습니다. 다른 구성원에게 소유권을 이전하세요.");
        if (typeof data.expectedRole !== "string") throw new HttpError(400, "현재 권한을 확인해 주세요.");
        if (target.role !== data.expectedRole) throw new HttpError(409, "권한이 변경되었습니다. 새로고침해 주세요.");
        await tx.execute({ sql: projectId ? "UPDATE project_members SET role=? WHERE project_id=? AND workspace_id=? AND user_id=?" : "UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?", args: projectId ? [String(data.role), projectId, user.workspaceId, data.userId] : [String(data.role), user.workspaceId, data.userId] });
      }
      await audit(request, { user, action: "UPDATE", resource: projectId ? "project_member" : "workspace_member", resourceId: data.userId, before: { role: String(target.role) }, after: { role: data.role }, metadata: { projectId, previousOwner: data.role === "owner" ? user.id : null } }, tx);
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; } finally { tx.close(); }
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
