import { requireUser, errorResponse, checkOrigin, body, HttpError } from "@/lib/auth";
import { projectAccess } from "@/lib/artifacts";
import { db } from "@/lib/db";
import { documentName, folderId, requireFolder } from "@/lib/documents";
import { audit } from "@/lib/audit";
import { randomUUID } from "node:crypto";

type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireUser(), { projectId } = await context.params;
    await projectAccess(db(), user, projectId);
    const current = folderId(new URL(request.url).searchParams.get("folderId"));
    await requireFolder(db(), user.workspaceId, projectId, current);
    const [folders, files] = await Promise.all([
      db().execute({ sql: "SELECT id,parent_id,name FROM project_folders WHERE workspace_id=? AND project_id=? ORDER BY name", args: [user.workspaceId, projectId] }),
      db().execute({ sql: `SELECT f.id,f.name,f.byte_length,f.created_at,u.name AS uploader FROM project_files f JOIN users u ON u.id=f.created_by WHERE f.workspace_id=? AND f.project_id=? AND f.folder_id IS ? ORDER BY f.created_at DESC,f.id`, args: [user.workspaceId, projectId, current] }),
    ]);
    return Response.json({
      folders: folders.rows.map(r => ({ id: String(r.id), parentId: r.parent_id === null ? null : String(r.parent_id), name: String(r.name) })),
      files: files.rows.map(r => ({ id: String(r.id), name: String(r.name), size: Number(r.byte_length), createdAt: String(r.created_at), uploadedBy: String(r.uploader) })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  return mutateFolder(request, context, "CREATE");
}
export async function PATCH(request: Request, context: Context) {
  return mutateFolder(request, context, "UPDATE");
}
export async function DELETE(request: Request, context: Context) {
  return mutateFolder(request, context, "DELETE");
}
async function mutateFolder(request: Request, context: Context, action: "CREATE" | "UPDATE" | "DELETE") {
  try {
    checkOrigin(request);
    const user = await requireUser(), { projectId } = await context.params;
    const input = await body(request), tx = await db().transaction("write");
    try {
      await projectAccess(tx, user, projectId, true);
      const id = action === "CREATE" ? randomUUID() : folderId(input.id);
      if (!id) throw new HttpError(400, "변경할 폴더를 선택해 주세요.");
      let before: Record<string, unknown> | undefined;
      if (action !== "CREATE") {
        await requireFolder(tx, user.workspaceId, projectId, id);
        before = (await tx.execute({ sql: "SELECT name FROM project_folders WHERE id=? AND workspace_id=? AND project_id=?", args: [id, user.workspaceId, projectId] })).rows[0];
      }
      const name = action === "DELETE" ? "" : documentName(input.name);
      if (action === "CREATE") {
        const parent = folderId(input.parentId);
        await requireFolder(tx, user.workspaceId, projectId, parent);
        await tx.execute({ sql: "INSERT INTO project_folders(id,workspace_id,project_id,parent_id,name,created_by) VALUES (?,?,?,?,?,?)", args: [id, user.workspaceId, projectId, parent, name, user.id] });
      } else if (action === "UPDATE") {
        await tx.execute({ sql: "UPDATE project_folders SET name=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND workspace_id=? AND project_id=?", args: [name, id, user.workspaceId, projectId] });
      } else {
        const children = await tx.execute({ sql: "SELECT id FROM project_folders WHERE workspace_id=? AND project_id=? AND parent_id=? UNION ALL SELECT id FROM project_files WHERE workspace_id=? AND project_id=? AND folder_id=? LIMIT 1", args: [user.workspaceId, projectId, id, user.workspaceId, projectId, id] });
        if (children.rows.length) throw new HttpError(409, "비어 있는 폴더만 삭제할 수 있습니다. 하위 폴더나 파일이 있습니다.");
        await tx.execute({ sql: "DELETE FROM project_folders WHERE id=? AND workspace_id=? AND project_id=?", args: [id, user.workspaceId, projectId] });
      }
      await audit(request, { user, action, resource: "project_folder", resourceId: id, before, after: action === "DELETE" ? undefined : { name }, metadata: { projectId } }, tx);
      await tx.commit();
      return Response.json({ id }, { status: action === "CREATE" ? 201 : 200 });
    } catch (error) {
      await tx.rollback();
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed"))
        throw new HttpError(409, "같은 위치에 동일한 이름의 폴더가 있습니다.");
      throw error;
    } finally { tx.close(); }
  } catch (error) { return errorResponse(error); }
}
