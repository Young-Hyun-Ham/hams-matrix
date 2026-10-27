import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { InStatement, Row } from "@libsql/client";
import { db } from "./db";
import { auditStatements } from "./audit";
import type { User } from "./types";
import type { RegistrationChoice } from "./registration";
const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "hams_session";
export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function checkOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL ?? request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(403, "요청 출처를 확인할 수 없습니다.");
}
export async function body(request: Request, maxLength = 10000) {
  if (Number(request.headers.get("content-length") ?? 0) > maxLength)
    throw new HttpError(413, "입력 내용이 너무 깁니다.");
  const raw = await request.text();
  if (raw.length > maxLength)
    throw new HttpError(413, "입력 내용이 너무 깁니다.");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "올바른 입력 형식이 아닙니다.");
  }
}
export function emailInput(value: unknown) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new HttpError(400, "이메일 주소를 확인해 주세요.");
  return email;
}
export function nameInput(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 2 || name.length > 80)
    throw new HttpError(400, "이름은 2~80자로 입력해 주세요.");
  return name;
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${((await scrypt(password, salt, 64)) as Buffer).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, key] = encoded.split(":");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex"),
    actual = (await scrypt(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function passwordInput(value: unknown) {
  if (
    typeof value !== "string" ||
    value.length < 10 ||
    value.length > 128 ||
    !/[a-zA-Z]/.test(value) ||
    !/\d/.test(value)
  )
    throw new HttpError(
      400,
      "비밀번호는 영문과 숫자를 포함해 10~128자로 입력해 주세요.",
    );
  return value;
}
export async function rateLimit(key: string, limit = 10) {
  const now = Date.now();
  const result = await db().execute({
    sql: `INSERT INTO auth_rate_limits(bucket,attempts,resets_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN resets_at < ? THEN 1 ELSE attempts+1 END,resets_at=CASE WHEN resets_at < ? THEN excluded.resets_at ELSE resets_at END RETURNING attempts`,
    args: [digest(key), now + 15 * 60 * 1000, now, now],
  });
  if (Number(result.rows[0].attempts) > limit)
    throw new HttpError(
      429,
      "시도 횟수를 초과했습니다. 15분 후 다시 시도해 주세요.",
    );
}
const userSelect = `SELECT u.id,u.name,u.email,u.job_title,u.account_role,u.onboarding_complete,m.workspace_id as workspaceId,w.name as workspaceName,m.role,COALESCE(w.subscription_plan,w.plan) AS plan FROM users u JOIN workspace_members m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id`;
// libSQL Row instances carry their own prototype; React server props must be plain DTOs.
function toUser(row: Row | undefined): User | null {
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name),
    jobTitle: String(row.job_title ?? ""),
    email: row.email === null ? null : String(row.email),
    workspaceId: String(row.workspaceId),
    workspaceName: String(row.workspaceName),
    role: String(row.role),
    plan: String(row.plan),
    accountRole: row.account_role === "user" ? "user" : "owner",
    onboardingComplete: Number(row.onboarding_complete) === 1,
  };
}
export async function userById(id: string): Promise<User | null> {
  const result = await db().execute({
    sql: `${userSelect} WHERE u.id=? ORDER BY CASE WHEN m.workspace_id=u.active_workspace_id THEN 0 ELSE 1 END,m.joined_at,m.workspace_id LIMIT 1`,
    args: [id],
  });
  return toUser(result.rows[0]);
}
export async function currentUser(): Promise<User | null> {
  // Session expiry must use request time, including during authenticated route prefetches.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await db().execute({
    sql: `${userSelect} JOIN sessions s ON s.user_id=u.id AND s.workspace_id=m.workspace_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > ? LIMIT 1`,
    args: [digest(token), new Date().toISOString()],
  });
  return toUser(result.rows[0]);
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "로그인이 필요합니다.");
  if (!user.onboardingComplete)
    throw new HttpError(403, "가입 유형 선택을 완료해 주세요.");
  return user;
}
export function requireWriter(user: User) {
  if (
    !user.onboardingComplete ||
    !["owner", "admin", "member"].includes(user.role)
  )
    throw new HttpError(403, "현재 역할에는 변경 권한이 없습니다.");
}
export function newUserStatements(
  id: string,
  workspaceId: string,
  name: string,
  email: string | null,
  passwordHash: string | null,
  choice: RegistrationChoice,
  onboardingComplete = true,
  jobTitle = "",
): InStatement[] {
  return [
    {
      sql: "INSERT INTO users(id,email,name,password_hash,account_role,onboarding_complete,job_title) VALUES (?,?,?,?,?,?,?)",
      args: [
        id,
        email,
        name,
        passwordHash,
        choice.role,
        onboardingComplete ? 1 : 0,
        jobTitle,
      ],
    },
    {
      sql: "INSERT INTO workspaces(id,name,plan,subscription_plan,owner_id) VALUES (?,?,?,?,?)",
      args: [
        workspaceId,
        choice.role === "owner" ? `${name}의 팀` : `${name}의 Guest`,
        choice.plan === "team" ? "pro" : choice.plan,
        choice.plan,
        choice.role === "owner" ? id : null,
      ],
    },
    {
      sql: "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,?)",
      args: [workspaceId, id, choice.role === "owner" ? "owner" : "viewer"],
    },
    {
      sql: "UPDATE users SET active_workspace_id=? WHERE id=?",
      args: [workspaceId, id],
    },
  ];
}
export async function signIn(
  request: Request,
  user: User,
  extra: InStatement[] = [],
  source: "web" | "oauth" = "web",
) {
  const token = randomBytes(32).toString("base64url"),
    id = randomUUID(),
    now = new Date();
  await db().batch(
    [
      ...extra,
      {
        sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
        args: [
          id,
          digest(token),
          user.id,
          user.workspaceId,
          now.toISOString(),
          new Date(now.getTime() + 7 * 86400000).toISOString(),
        ],
      },
      ...auditStatements(request, {
        user,
        action: "CREATE",
        resource: "session",
        resourceId: id,
        source,
      }),
      ...auditStatements(request, {
        user,
        action: "LOGIN",
        resource: "session",
        resourceId: id,
        source,
      }),
    ],
    "write",
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    ...cookieOptions,
    maxAge: 7 * 86400,
  });
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    { error: "처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요." },
    { status: 500 },
  );
}
