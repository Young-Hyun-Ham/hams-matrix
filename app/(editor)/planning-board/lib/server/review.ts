import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth";
import type { User } from "@/lib/types";
import { access, boardRow, scoped, type Scope } from "./access";
export async function review(
  user: User,
  scope: Scope,
  input: Record<string, unknown>,
) {
  const tx = await db().transaction("write");
  try {
    const a = await access(user, scope, true, tx),
      row = await boardRow(user, scope, tx);
    if (!row) throw new HttpError(409, "먼저 문서를 저장해 주세요.");
    if (
      input.expectedVersion !== Number(row.version) ||
      input.expectedScreenVersion !== Number(a.screen.version)
    )
      throw new HttpError(409, "검토 대상 버전이 변경되었습니다.");
    const action = input.action,
      message = typeof input.message === "string" ? input.message.trim() : "";
    if (
      !["request", "reject", "complete"].includes(String(action)) ||
      message.length > 2000 ||
      (action !== "request" && !message)
    )
      throw new HttpError(400, "처리 내용은 1~2,000자로 입력해 주세요.");
    let reviewer: string | null = null,
      status: string;
    if (action === "request") {
      if (a.permissions.ownerId !== user.id)
        throw new HttpError(
          403,
          "프로젝트 소유자만 검토를 요청할 수 있습니다.",
        );
      if (row.status === "review" && input.reassign !== true)
        throw new HttpError(409, "이미 검토 중입니다.");
      reviewer =
        typeof input.reviewerEmail === "string" ? input.reviewerEmail : "";
      if (row.status === "review" && reviewer === row.reviewer_user_id)
        throw new HttpError(409, "기존 검토자와 다른 구성원을 선택해 주세요.");
      if (reviewer === user.id)
        throw new HttpError(400, "자신을 검토자로 지정할 수 없습니다.");
      const member = (
        await tx.execute({
          sql: "SELECT u.id,u.name,u.account_role,u.onboarding_complete,u.email,m.workspace_id,w.name AS workspaceName,w.name AS workspaceName,m.role FROM project_members pm JOIN users u ON u.id=pm.user_id JOIN workspace_members m ON m.user_id=u.id AND m.workspace_id=pm.workspace_id JOIN workspaces w ON w.id=m.workspace_id WHERE pm.user_id=? AND pm.project_id=? AND pm.workspace_id=?",
          args: [reviewer, scope.projectId, user.workspaceId],
        })
      ).rows[0];
      if (!member)
        throw new HttpError(400, "현재 프로젝트 구성원을 선택해 주세요.");
      await access(
        {
          ...user,
          id: reviewer,
          accountRole: member.account_role as User["accountRole"],
          onboardingComplete: Number(member.onboarding_complete) === 1,
        },
        scope,
        true,
        tx,
      );
      status = "review";
    } else if (row.status === "review") {
      if (
        row.reviewer_user_id !== user.id ||
        row.review_content_version !== row.content_version
      )
        throw new HttpError(403, "현재 지정된 검토자만 처리할 수 있습니다.");
      reviewer = String(row.reviewer_user_id);
      status = action === "reject" ? "rejected" : "complete";
    } else {
      if (
        action !== "complete" ||
        a.permissions.ownerId !== user.id ||
        !["draft", "rejected"].includes(String(row.status))
      )
        throw new HttpError(403, "현재 상태에서 처리할 수 없습니다.");
      status = "complete";
    }
    const now = new Date().toISOString(),
      version = Number(row.version) + 1;
    await tx.execute({
      sql: "UPDATE planning_boards SET status=?,reviewer_user_id=?,review_content_version=?,version=?,updated_by=?,updated_at=? WHERE id=? AND workspace_id=? AND project_id=? AND screen_artifact_id=?",
      args: [
        status,
        reviewer,
        row.content_version,
        version,
        user.id,
        now,
        row.id,
        ...scoped(user, scope),
      ],
    });
    await tx.execute({
      sql: "INSERT INTO planning_board_review_history(id,board_id,workspace_id,project_id,screen_artifact_id,action,from_status,to_status,actor_id,actor_role,reviewer_id,content_version,message,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      args: [
        randomUUID(),
        row.id,
        ...scoped(user, scope),
        action === "request" && row.status === "review"
          ? "reassign"
          : String(action),
        row.status,
        status,
        user.id,
        a.permissions.projectRole,
        reviewer,
        row.content_version,
        message,
        now,
      ],
    });
    await tx.commit();
    return { status, version, screenVersion: Number(a.screen.version) };
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
