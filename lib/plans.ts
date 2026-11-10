import "server-only";
import type { Client, Row } from "@libsql/client";
import { db } from "./db";
import { HttpError } from "./auth";
import { isPlatformAdmin, type Plan } from "./plan-types";
import type { User } from "./types";
type Executor = Pick<Client, "execute">;
export function toPlan(row: Row): Plan {
  const nullable = (key: string) =>
    row[key] == null ? null : Number(row[key]);
  return {
    code: String(row.code) as Plan["code"],
    name: String(row.name),
    priceMode: row.price_mode === "contact" ? "contact" : "fixed",
    monthlyPrice: nullable("monthly_price"),
    yearlyPrice: nullable("yearly_price"),
    monthlyDiscountPrice: nullable("monthly_discount_price"),
    yearlyDiscountPrice: nullable("yearly_discount_price"),
    projectLimit: nullable("project_limit"),
    projectInviteLimit: nullable("project_invite_limit"),
    tokenLimit: nullable("token_limit"),
    dailyImageLimit: nullable("daily_image_limit"),
    attachmentLimit: Number(row.attachment_limit),
    historyEnabled: Number(row.history_enabled) === 1,
    teamSharingEnabled: Number(row.team_sharing_enabled) === 1,
    recommended: Number(row.recommended) === 1,
    version: Number(row.version),
  };
}
export async function listPlans(executor: Executor = db()) {
  return (
    await executor.execute(
      "SELECT * FROM plans ORDER BY CASE code WHEN 'free' THEN 0 WHEN 'pro' THEN 1 WHEN 'team' THEN 2 ELSE 3 END",
    )
  ).rows.map(toPlan);
}
export async function memberPlan(userId: string, executor: Executor = db()) {
  const row = (
    await executor.execute({
      sql: "SELECT p.* FROM user_subscriptions s JOIN plans p ON p.code=s.plan_code WHERE s.user_id=?",
      args: [userId],
    })
  ).rows[0];
  if (!row) throw new HttpError(503, "회원 요금제 정보를 확인할 수 없습니다.");
  return toPlan(row);
}
// Read both policies in one query, scoped to the caller's actual workspace.
export async function workspacePlan(
  userId: string,
  workspaceId: string,
  executor: Executor = db(),
) {
  const row = (
    await executor.execute({
      sql: "SELECT p.*,s.plan_code AS member_plan,w.product_id AS workspace_product,s.product_id AS member_product FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=? JOIN user_subscriptions s ON s.user_id=m.user_id JOIN plans p ON p.code=w.plan WHERE w.id=? AND w.subscription_plan=w.plan",
      args: [userId, workspaceId],
    })
  ).rows[0];
  if (!row)
    throw new HttpError(
      403,
      "워크스페이스 플랜과 소속 정보를 확인할 수 없습니다.",
    );
  if (
    row.member_plan !== row.code ||
    row.workspace_product !== row.member_product
  )
    throw new HttpError(
      409,
      "현재 요금제가 워크스페이스 플랜과 다릅니다. 워크스페이스 플랜에 맞게 요금제를 변경해 주세요.",
      {
        code: "WORKSPACE_PLAN_MISMATCH",
        workspaceId,
        workspacePlan: String(row.code),
        currentPlan: String(row.member_plan),
        workspaceProductId: row.workspace_product,
        currentProductId: row.member_product,
        redirectTo: "/settings/subscription?reason=workspace-plan",
      },
    );
  if (row.workspace_product != null) {
    const { productById } = await import("./product-access");
    try {
      await productById(String(row.workspace_product), executor);
    } catch {
      throw new HttpError(
        403,
        "상품이 중지되었거나 이용 기간이 종료되었습니다. 관리자에게 문의해 주세요.",
        { code: "PRODUCT_INACTIVE" },
      );
    }
    const member = (
      await executor.execute({
        sql: "SELECT user_id FROM product_members WHERE product_id=? AND user_id=? AND status='active'",
        args: [String(row.workspace_product), userId],
      })
    ).rows[0];
    if (!member)
      throw new HttpError(
        403,
        "상품 지원이 종료되었거나 소속을 확인할 수 없습니다.",
        { code: "PRODUCT_ACCESS_REVOKED" },
      );
  }
  return toPlan(row);
}
export function requirePlatformAdmin(user: User) {
  if (!isPlatformAdmin(user.accountRole))
    throw new HttpError(403, "서비스 관리자만 이용할 수 있습니다.");
}
export async function assertTeamSharingEnabled(
  userId: string,
  executor: Executor = db(),
  workspaceId?: string,
) {
  if (!(await policyPlan(userId, executor, workspaceId)).teamSharingEnabled)
    throw new HttpError(403, "현재 요금제에서는 팀공유를 사용할 수 없습니다.");
}
// Invited participants exclude the project owner; existing members are retained after a limit decrease.
export async function assertProjectInviteCapacity(
  userId: string,
  inviteCount: number,
  executor: Executor = db(),
  workspaceId?: string,
) {
  const plan = await policyPlan(userId, executor, workspaceId);
  if (plan.projectInviteLimit !== null && inviteCount > plan.projectInviteLimit)
    throw new HttpError(
      403,
      `현재 요금제에서는 프로젝트당 ${plan.projectInviteLimit}명까지 팀원을 초대할 수 있습니다.`,
      { code: "PROJECT_INVITE_LIMIT", limit: plan.projectInviteLimit },
    );
}
export async function assertProjectCapacity(
  userId: string,
  executor: Executor = db(),
  workspaceId?: string,
) {
  const plan = await policyPlan(userId, executor, workspaceId);
  const count = Number(
    (
      await executor.execute({
        sql: "SELECT count(*) AS count FROM projects WHERE owner_id=? AND workspace_id=?",
        args: [
          userId,
          workspaceId ?? (await activeWorkspaceId(userId, executor)),
        ],
      })
    ).rows[0].count,
  );
  if (plan.projectLimit !== null && count >= plan.projectLimit)
    throw new HttpError(
      403,
      `${plan.name} 플랜은 프로젝트를 ${plan.projectLimit}개까지 보유할 수 있습니다.`,
    );
}
export async function projectHistoryEnabled(
  projectId: string,
  executor: Executor = db(),
) {
  const row = (
    await executor.execute({
      sql: "SELECT p.history_enabled FROM projects pr JOIN workspaces w ON w.id=pr.workspace_id JOIN plans p ON p.code=w.plan AND w.subscription_plan=w.plan WHERE pr.id=?",
      args: [projectId],
    })
  ).rows[0];
  return Number(row?.history_enabled) === 1;
}

async function activeWorkspaceId(userId: string, executor: Executor) {
  const row = (
    await executor.execute({
      sql: "SELECT active_workspace_id FROM users WHERE id=?",
      args: [userId],
    })
  ).rows[0];
  if (!row?.active_workspace_id)
    throw new HttpError(403, "워크스페이스를 선택해 주세요.");
  return String(row.active_workspace_id);
}

export async function policyPlan(
  userId: string,
  executor: Executor = db(),
  workspaceId?: string,
) {
  return workspacePlan(
    userId,
    workspaceId ?? (await activeWorkspaceId(userId, executor)),
    executor,
  );
}
