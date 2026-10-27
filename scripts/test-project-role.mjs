import { randomUUID } from "node:crypto";
export async function temporaryProjectViewer(client, user, projectId) {
  const owner = randomUUID();
  await client.batch([
    { sql: "INSERT INTO users(id,name) VALUES (?,'권한 검증 임시 소유자')", args: [owner] },
    { sql: "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,'member')", args: [user.workspaceId, owner] },
    { sql: "INSERT INTO project_members(project_id,workspace_id,user_id) VALUES (?,?,?)", args: [projectId, user.workspaceId, owner] },
    { sql: "UPDATE projects SET owner_id=? WHERE id=?", args: [owner, projectId] },
    { sql: "UPDATE project_members SET role='viewer' WHERE project_id=? AND user_id=?", args: [projectId, user.id] },
  ], "write");
  return async () => client.batch([
    { sql: "UPDATE projects SET owner_id=? WHERE id=?", args: [user.id, projectId] },
    { sql: "UPDATE project_members SET role=NULL WHERE project_id=? AND user_id=?", args: [projectId, user.id] },
    { sql: "DELETE FROM project_members WHERE project_id=? AND user_id=?", args: [projectId, owner] },
    { sql: "DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?", args: [user.workspaceId, owner] },
    { sql: "DELETE FROM users WHERE id=?", args: [owner] },
  ], "write");
}
