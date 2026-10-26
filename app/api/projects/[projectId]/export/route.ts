import { requireUser, errorResponse } from "@/lib/auth";
import { projectData } from "@/lib/artifacts";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { exportSheets, workbook } from "@/lib/workbook";
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser(),
      { projectId } = await context.params;
    const tx = await db().transaction("read");
    let data;
    try {
      data = await projectData(tx, user, projectId);
      await tx.commit();
    } finally {
      tx.close();
    }
    const content = workbook(exportSheets(data));
    await audit(request, {
      user,
      action: "READ",
      resource: "project_export",
      resourceId: projectId,
      metadata: { format: "xlsx", returned: data.artifacts.length },
    });
    return new Response(new Uint8Array(content), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="project-documents.xlsx"; filename*=UTF-8''${encodeURIComponent(data.project.name + "-산출물.xlsx")}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
