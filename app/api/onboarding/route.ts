import {
  body,
  checkOrigin,
  currentUser,
  errorResponse,
  HttpError,
  userById,
} from "@/lib/auth";
import { registrationChoice, joinRequestStatements } from "@/lib/registration";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    if (!user) throw new HttpError(401, "로그인이 필요합니다.");
    const choice = await registrationChoice(await body(request));
    const tx = await db().transaction("write");
    try {
      const row = await tx.execute({
        sql: "SELECT onboarding_complete,active_workspace_id FROM users WHERE id=?",
        args: [user.id],
      });
      if (
        !row.rows[0] ||
        Number(row.rows[0].onboarding_complete) !== 0 ||
        row.rows[0].active_workspace_id !== user.workspaceId
      )
        throw new HttpError(409, "이미 가입 유형 선택이 완료된 계정입니다.");
      const name =
        choice.role === "owner" ? `${user.name}의 팀` : `${user.name}의 Guest`;
      await tx.execute({
        sql: "UPDATE users SET account_role=?,onboarding_complete=1,updated_at=? WHERE id=?",
        args: [choice.role, new Date().toISOString(), user.id],
      });
      await tx.execute({
        sql: "UPDATE workspaces SET name=?,plan=?,subscription_plan=?,owner_id=? WHERE id=?",
        args: [
          name,
          choice.plan === "team" ? "pro" : choice.plan,
          choice.plan,
          choice.role === "owner" ? user.id : null,
          user.workspaceId,
        ],
      });
      await tx.execute({
        sql: "UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?",
        args: [
          choice.role === "owner" ? "owner" : "viewer",
          user.workspaceId,
          user.id,
        ],
      });
      for (const statement of joinRequestStatements(request, user, choice))
        await tx.execute(statement);
      await audit(
        request,
        {
          user,
          action: "UPDATE",
          resource: "registration",
          resourceId: user.id,
          before: { accountRole: user.accountRole, onboardingComplete: false },
          after: {
            accountRole: choice.role,
            onboardingComplete: true,
            plan: choice.plan,
          },
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
    return Response.json(
      { user: await userById(user.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
