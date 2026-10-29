import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import {
  body,
  checkOrigin,
  errorResponse,
  HttpError,
  requireUser,
  requireWriter,
  rateLimit,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { projectAccess } from "@/lib/artifacts";
import type { User } from "@/lib/types";
import { audit } from "@/lib/audit";
async function access(
  executor: Pick<Client, "execute">,
  user: User,
  id: string,
  write = false,
) {
  const post = (
    await executor.execute({
      sql: "SELECT project_id FROM team_posts WHERE id=? AND workspace_id=?",
      args: [id, user.workspaceId],
    })
  ).rows[0];
  if (!post) throw new HttpError(404, "게시글을 찾을 수 없습니다.");
  if (post.project_id)
    await projectAccess(executor, user, String(post.project_id), write);
  else if (write) {
    const role = (
      await executor.execute({
        sql: "SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?",
        args: [user.workspaceId, user.id],
      })
    ).rows[0];
    requireWriter({ ...user, role: String(role?.role ?? "") });
  }
}
type Context = { params: Promise<{ postId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser(),
      { postId } = await context.params;
    await access(db(), user, postId);
    const rows = await db().execute({
      sql: "SELECT c.id,c.body,c.created_at,u.name,u.job_title FROM team_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=? AND c.workspace_id=? ORDER BY c.created_at,c.id LIMIT 200",
      args: [postId, user.workspaceId],
    });
    return Response.json(
      {
        comments: rows.rows.map((row) => ({
          id: String(row.id),
          body: String(row.body),
          createdAt: String(row.created_at),
          author: String(row.name),
          jobTitle: String(row.job_title),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    checkOrigin(request);
    const user = await requireUser(),
      { postId } = await context.params,
      input = await body(request);
    const text = typeof input.body === "string" ? input.body.trim() : "";
    if (!text || text.length > 2000)
      throw new HttpError(400, "댓글은 1~2,000자로 입력해 주세요.");
    await rateLimit(`team-comment:${user.id}`, 60);
    const tx = await db().transaction("write");
    const id = randomUUID();
    try {
      await access(tx, user, postId, true);
      await tx.execute({
        sql: "INSERT INTO team_comments(id,post_id,workspace_id,author_id,body,created_at) VALUES (?,?,?,?,?,?)",
        args: [
          id,
          postId,
          user.workspaceId,
          user.id,
          text,
          new Date().toISOString(),
        ],
      });
      await audit(
        request,
        {
          user,
          action: "CREATE",
          resource: "team_comment",
          resourceId: id,
          metadata: { postId },
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
