import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { audit, auditStatements } from "@/lib/audit";
import {
  body,
  checkOrigin,
  cookieOptions,
  currentUser,
  digest,
  emailInput,
  errorResponse,
  hashPassword,
  HttpError,
  nameInput,
  newUserStatements,
  passwordInput,
  rateLimit,
  SESSION_COOKIE,
  signIn,
  userById,
  verifyPassword,
} from "@/lib/auth";
import type { User } from "@/lib/types";
import {
  registrationChoice,
  joinRequestStatements,
  registrationJobTitle,
} from "@/lib/registration";

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  try {
    checkOrigin(request);
    const { action } = await context.params;
    if (action === "logout") {
      const user = await currentUser();
      if (!user) throw new HttpError(401, "로그인이 필요합니다.");
      const store = await cookies(),
        token = store.get(SESSION_COOKIE)?.value ?? "";
      await db().batch(
        [
          {
            sql: "UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL",
            args: [new Date().toISOString(), digest(token)],
          },
          ...auditStatements(request, {
            user,
            action: "LOGOUT",
            resource: "session",
          }),
          ...auditStatements(request, {
            user,
            action: "DELETE",
            resource: "session",
            metadata: { mode: "revoke" },
          }),
        ],
        "write",
      );
      store.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
      return Response.json({ ok: true });
    }
    if (action !== "signup" && action !== "login")
      throw new HttpError(404, "존재하지 않는 기능입니다.");
    const data = await body(request),
      email = emailInput(data.email);
    await rateLimit(`auth:${action}:${email}`);
    // This cookie bucket supplements per-account limits without trusting spoofable proxy headers.
    const store = await cookies();
    const browserBucket = store.get("hams_attempt")?.value ?? randomUUID();
    store.set("hams_attempt", browserBucket, {
      ...cookieOptions,
      maxAge: 86400,
    });
    await rateLimit(`browser:${browserBucket}`, 30);
    if (action === "signup") {
      const name = nameInput(data.name),
        password = passwordInput(data.password);
      if (data.accepted !== true)
        throw new HttpError(
          400,
          "서비스 이용 및 개인정보 처리 안내에 동의해 주세요.",
        );
      const choice = await registrationChoice(data);
      const jobTitle = registrationJobTitle(data.jobTitle);
      const existing = await db().execute({
        sql: "SELECT id FROM users WHERE email=?",
        args: [email],
      });
      if (existing.rows.length)
        throw new HttpError(
          409,
          "가입할 수 없는 이메일입니다. 기존 로그인 방법을 확인해 주세요.",
        );
      const id = randomUUID(),
        workspaceId = randomUUID();
      const user: User = {
        id,
        email,
        name,
        workspaceId,
        workspaceName: `${name}의 워크스페이스`,
        role: "owner",
        plan: choice.plan,
        accountRole: "user",
        onboardingComplete: true,
        jobTitle,
      };
      const statements = newUserStatements(
        id,
        workspaceId,
        name,
        email,
        await hashPassword(password),
        choice,
        true,
        jobTitle,
      );
      statements.push(
        ...auditStatements(request, {
          user,
          action: "CREATE",
          resource: "user",
          resourceId: id,
          after: { name, accountRole: choice.role },
          metadata: { acceptedPolicyVersion: "2026-10-22" },
        }),
      );
      statements.push(
        ...auditStatements(request, {
          user,
          action: "CREATE",
          resource: "workspace",
          resourceId: workspaceId,
          after: { workspaceName: user.workspaceName, plan: choice.plan },
        }),
      );
      statements.push(
        ...auditStatements(request, {
          user,
          action: "CREATE",
          resource: "workspace_member",
          resourceId: id,
          after: { role: user.role },
        }),
      );
      statements.push(...joinRequestStatements(request, user, choice));
      await signIn(request, user, statements);
      return Response.json(
        { user },
        { status: 201, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (typeof data.password !== "string" || data.password.length > 128)
      throw new HttpError(400, "비밀번호를 확인해 주세요.");
    const result = await db().execute({
      sql: "SELECT id,password_hash FROM users WHERE email=?",
      args: [email],
    });
    const row = result.rows[0];
    // A fixed dummy hash avoids skipping the expensive password operation for unknown users.
    const encoded = row?.password_hash
      ? String(row.password_hash)
      : `scrypt:00000000000000000000000000000000:${"00".repeat(64)}`;
    const valid = await verifyPassword(data.password, encoded);
    if (!row || !row.password_hash || !valid) {
      await audit(request, {
        action: "LOGIN_FAILED",
        resource: "session",
        outcome: "failure",
        errorCode: "INVALID_CREDENTIALS",
      });
      throw new HttpError(401, "이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    const user = await userById(String(row.id));
    if (!user) throw new HttpError(403, "워크스페이스 접근 권한이 없습니다.");
    await signIn(request, user);
    return Response.json(
      { user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
