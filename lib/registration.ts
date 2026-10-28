import { randomUUID } from "node:crypto";
import type { InStatement } from "@libsql/client";
import { HttpError } from "./auth";
import { auditStatements } from "./audit";
import type { User } from "./types";

export type RegistrationChoice = {
  role: "owner" | "user";
  plan: "free" | "team" | "business";
  teamId: string | null;
};
export function registrationJobTitle(value: unknown) {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.trim().length > 80) throw new HttpError(400, "담당 역할은 80자 이내로 입력해 주세요.");
  return value.trim();
}

export async function registrationChoice(
  data: Record<string, unknown>,
): Promise<RegistrationChoice> {
  if ((data.role !== undefined && data.role !== "user") ||
      (data.accountRole !== undefined && data.accountRole !== "user") ||
      (data.plan !== undefined && data.plan !== "free") || data.teamId != null)
    throw new HttpError(400, "회원가입은 user 역할과 Free 플랜으로 시작합니다.");
  return { role: "user", plan: "free", teamId: null };
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
