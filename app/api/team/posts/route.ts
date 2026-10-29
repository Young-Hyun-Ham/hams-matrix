import { randomUUID } from "node:crypto";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
  rateLimit,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/artifacts";
import { audit } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    const user = await requireUser(),
      projectId = new URL(request.url).searchParams.get("projectId") || "";
    if (!projectId)
      return Response.json(
        { posts: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (projectId) await projectAccess(db(), user, projectId);
    const rows = await db().execute({
      sql: `SELECT t.id,t.title,t.body,t.category,t.created_at,t.project_id,u.name,u.job_title,p.name AS project_name,(SELECT COUNT(*) FROM team_comments c WHERE c.post_id=t.id AND c.workspace_id=t.workspace_id) AS comments FROM team_posts t JOIN users u ON u.id=t.author_id LEFT JOIN projects p ON p.id=t.project_id AND p.workspace_id=t.workspace_id WHERE t.workspace_id=? AND (t.project_id IS NULL OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=t.project_id AND m.workspace_id=t.workspace_id AND m.user_id=?)) ${projectId ? "AND t.project_id=?" : ""} ORDER BY t.created_at DESC,t.id DESC LIMIT 100`,
      args: projectId
        ? [user.workspaceId, user.id, projectId]
        : [user.workspaceId, user.id],
    });
    return Response.json(
      {
        posts: rows.rows.map((row) => ({
          id: String(row.id),
          title: String(row.title),
          body: String(row.body),
          category: String(row.category),
          createdAt: String(row.created_at),
          projectId: row.project_id ? String(row.project_id) : null,
          projectName: row.project_name ? String(row.project_name) : null,
          author: String(row.name),
          jobTitle: String(row.job_title),
          comments: Number(row.comments),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      input = await body(request, 50000);
    const projectId =
      typeof input.projectId === "string" ? input.projectId : "";
    if (!projectId)
      throw new HttpError(400, "공유 글을 작성할 프로젝트를 선택해 주세요.");
    const title = typeof input.title === "string" ? input.title.trim() : "",
      text = typeof input.body === "string" ? input.body.trim() : "";
    if (
      !title ||
      title.length > 160 ||
      !text ||
      text.length > 10000 ||
      !["공유", "공지", "질문", "진행 상황"].includes(String(input.category))
    )
      throw new HttpError(
        400,
        "제목 160자, 내용 10,000자 이내로 작성하고 분류를 선택해 주세요.",
      );
    await rateLimit(`team-post:${user.id}`, 30);
    const tx = await db().transaction("write");
    const id = randomUUID();
    try {
      const access = await projectAccess(tx, user, projectId);
      if (!["owner", "admin", "member"].includes(String(access.role)))
        throw new HttpError(
          403,
          "선택한 프로젝트의 owner, admin, member만 공유 글을 작성할 수 있습니다.",
        );
      await tx.execute({
        sql: "INSERT INTO team_posts(id,workspace_id,project_id,author_id,title,body,category,created_at) VALUES (?,?,?,?,?,?,?,?)",
        args: [
          id,
          user.workspaceId,
          projectId || null,
          user.id,
          title,
          text,
          String(input.category),
          new Date().toISOString(),
        ],
      });
      await audit(
        request,
        {
          user,
          action: "CREATE",
          resource: "team_post",
          resourceId: id,
          after: { title },
          metadata: { projectId },
        },
        tx,
      );
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
