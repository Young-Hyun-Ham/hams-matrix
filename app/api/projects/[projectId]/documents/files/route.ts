import { randomUUID } from "node:crypto";
import { requireUser, checkOrigin, errorResponse } from "@/lib/auth";
import { projectAccess } from "@/lib/artifacts";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { documentName, folderId, requireFolder, readDocumentUpload } from "@/lib/documents";
import { putDocument, removeDocument } from "@/lib/r2";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    checkOrigin(request);
    const user = await requireUser(), { projectId } = await context.params;
    await projectAccess(db(), user, projectId, true);
    const query = new URL(request.url).searchParams;
    const parent = folderId(query.get("folderId")), name = documentName(query.get("name"), 255);
    await requireFolder(db(), user.workspaceId, projectId, parent);
    const bytes = await readDocumentUpload(request), id = randomUUID();
    const key = `workspaces/${user.workspaceId}/projects/${projectId}/documents/${id}`;
    await putDocument(key, bytes);
    try {
      const tx = await db().transaction("write");
      try {
        // Recheck after the network upload, including concurrent folder deletion or access changes.
        await projectAccess(tx, user, projectId, true);
        await requireFolder(tx, user.workspaceId, projectId, parent);
        await tx.execute({ sql: "INSERT INTO project_files(id,workspace_id,project_id,folder_id,name,object_key,byte_length,mime_type,created_by) VALUES (?,?,?,?,?,?,?,?,?)", args: [id, user.workspaceId, projectId, parent, name, key, bytes.length, "application/octet-stream", user.id] });
        await audit(request, { user, action: "CREATE", resource: "project_file", resourceId: id, after: { name }, metadata: { projectId, folderId: parent, byteLength: bytes.length } }, tx);
        await tx.commit();
      } catch (error) { await tx.rollback(); throw error; }
      finally { tx.close(); }
    } catch (error) {
      try { await removeDocument(key); }
      catch { console.error("Document upload cleanup failed", id); }
      throw error;
    }
    return Response.json({ id }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
