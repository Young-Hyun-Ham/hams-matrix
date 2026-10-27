import { requireUser, errorResponse, HttpError, checkOrigin, body } from "@/lib/auth";
import { projectAccess } from "@/lib/artifacts";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { getDocument, removeDocument } from "@/lib/r2";
import { documentName } from "@/lib/documents";

type Context = { params: Promise<{ projectId: string; fileId: string }> };

export async function PATCH(request: Request, context: Context) {
  return mutateFile(request, context, "UPDATE");
}

export async function DELETE(request: Request, context: Context) {
  return mutateFile(request, context, "DELETE");
}

async function mutateFile(request: Request, context: Context, action: "UPDATE" | "DELETE") {
  try {
    checkOrigin(request);
    const user = await requireUser(), { projectId, fileId } = await context.params;
    const input = action === "UPDATE" ? await body(request) : null;
    const tx = await db().transaction("write");
    try {
      await projectAccess(tx, user, projectId, true);
      const row = (await tx.execute({
        sql: "SELECT name,object_key FROM project_files WHERE id=? AND workspace_id=? AND project_id=?",
        args: [fileId, user.workspaceId, projectId],
      })).rows[0];
      if (!row) throw new HttpError(404, "파일을 찾을 수 없습니다.");
      const name = action === "UPDATE" ? documentName(input?.name, 255) : null;
      if (action === "UPDATE") {
        await tx.execute({ sql: "UPDATE project_files SET name=? WHERE id=? AND workspace_id=? AND project_id=?", args: [name, fileId, user.workspaceId, projectId] });
      } else {
        // Keep the metadata available for retry if R2 deletion fails. DeleteObject is idempotent.
        await removeDocument(String(row.object_key));
        await tx.execute({ sql: "DELETE FROM project_files WHERE id=? AND workspace_id=? AND project_id=?", args: [fileId, user.workspaceId, projectId] });
      }
      await audit(request, {
        user, action, resource: "project_file", resourceId: fileId,
        before: { name: String(row.name) }, after: name === null ? undefined : { name }, metadata: { projectId },
      }, tx);
      await tx.commit();
      return Response.json({ id: fileId });
    } catch (error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string; fileId: string }> }) {
  try {
    const user = await requireUser(), { projectId, fileId } = await context.params;
    await projectAccess(db(), user, projectId);
    const row = (await db().execute({ sql: "SELECT name,object_key FROM project_files WHERE id=? AND workspace_id=? AND project_id=?", args: [fileId, user.workspaceId, projectId] })).rows[0];
    if (!row) throw new HttpError(404, "파일을 찾을 수 없습니다.");
    const bytes = await getDocument(String(row.object_key));
    await audit(request, { user, action: "READ", resource: "project_file", resourceId: fileId, metadata: { projectId, download: true } });
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(String(row.name)).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return errorResponse(error); }
}
