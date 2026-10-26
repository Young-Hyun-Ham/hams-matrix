import { randomUUID } from "node:crypto";
import type { InStatement } from "@libsql/client";
import { HttpError } from "./auth";
import { db } from "./db";
import { auditStatements } from "./audit";
import type { User } from "./types";

export type RegistrationChoice = {
  role: "owner" | "user";
  plan: "free" | "team" | "business";
  teamId: string | null;
};

export async function registrationChoice(
  data: Record<string, unknown>,
): Promise<RegistrationChoice> {
  if (data.role === "owner") {
    if (data.plan !== "team" && data.plan !== "business")
      throw new HttpError(
        400,
        "owner는 Team 또는 Business 플랜을 선택해 주세요.",
      );
    if (data.teamId != null)
      throw new HttpError(400, "owner는 다른 팀에 가입할 수 없습니다.");
    return { role: "owner", plan: data.plan, teamId: null };
  }
  if (data.role !== "user" || data.plan !== "free")
    throw new HttpError(
      400,
      "역할과 가입 유형을 선택해 주세요. user는 Free 플랜으로 가입합니다.",
    );
  if (
    data.teamId !== null &&
    (typeof data.teamId !== "string" ||
      !data.teamId ||
      data.teamId.length > 100)
  )
    throw new HttpError(400, "Guest 또는 팀을 선택해 주세요.");
  if (typeof data.teamId === "string") {
    const team = await db().execute({
      sql: "SELECT w.id FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id AND m.user_id=w.owner_id AND m.role='owner' JOIN users u ON u.id=w.owner_id WHERE w.id=? AND u.account_role='owner' AND u.onboarding_complete=1 AND w.subscription_plan IN ('team','business')",
      args: [data.teamId],
    });
    if (!team.rows.length)
      throw new HttpError(
        400,
        "가입 신청할 수 없는 팀입니다. 팀을 다시 선택해 주세요.",
      );
  }
  return { role: "user", plan: "free", teamId: data.teamId as string | null };
}

export function joinRequestStatements(
  request: Request,
  user: User,
  choice: RegistrationChoice,
): InStatement[] {
  if (!choice.teamId) return [];
  const id = randomUUID();
  return [
    {
      sql: "INSERT INTO team_join_requests(id,workspace_id,user_id) VALUES (?,?,?)",
      args: [id, choice.teamId, user.id],
    },
    ...auditStatements(request, {
      user,
      action: "CREATE",
      resource: "team_join_request",
      resourceId: id,
      after: { status: "pending" },
      metadata: { teamId: choice.teamId },
    }),
  ];
}
