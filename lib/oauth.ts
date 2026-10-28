import { randomBytes, randomUUID, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { InStatement } from "@libsql/client";
import { db } from "./db";
import { audit, auditStatements } from "./audit";
import {
  cookieOptions,
  newUserStatements,
  rateLimit,
  signIn,
  userById,
} from "./auth";
import type { User } from "./types";

const providers = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    profile: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
  naver: {
    authorize: "https://nid.naver.com/oauth2.0/authorize",
    token: "https://nid.naver.com/oauth2.0/token",
    profile: "https://openapi.naver.com/v1/nid/me",
    scope: "",
  },
  kakao: {
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    profile: "https://kapi.kakao.com/v2/user/me",
    scope: "",
  },
};
export type Provider = keyof typeof providers;
function config(provider: string, request: Request) {
  if (!(provider in providers)) throw new Error("unknown_provider");
  const key = provider as Provider,
    prefix = key.toUpperCase();
  const id = process.env[`${prefix}_CLIENT_ID`],
    secret = process.env[`${prefix}_CLIENT_SECRET`];
  if (
    !id ||
    (key !== "kakao" && !secret) ||
    (process.env.NODE_ENV === "production" && !process.env.APP_URL)
  )
    throw new Error("not_configured");
  const origin = new URL(process.env.APP_URL ?? request.url).origin;
  return {
    ...providers[key],
    id,
    secret,
    key,
    origin,
    redirect: `${origin}/api/auth/oauth/${key}/callback`,
  };
}
function loginError(request: Request, code: string) {
  const url = new URL("/login", process.env.APP_URL ?? request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}
export async function startOAuth(request: Request, provider: string) {
  try {
    const cfg = config(provider, request),
      state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    await audit(request, {
      action: "OAUTH_START",
      resource: "session",
      source: "oauth",
      metadata: { provider: cfg.key },
    });
    (await cookies()).set(
      `hams_oauth_${cfg.key}`,
      JSON.stringify({ state, verifier }),
      { ...cookieOptions, maxAge: 600 },
    );
    const url = new URL(cfg.authorize);
    url.search = new URLSearchParams({
      client_id: cfg.id,
      redirect_uri: cfg.redirect,
      response_type: "code",
      state,
      ...(cfg.scope ? { scope: cfg.scope } : {}),
    }).toString();
    if (cfg.key === "google") {
      url.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      url.searchParams.set("code_challenge_method", "S256");
    }
    return NextResponse.redirect(url);
  } catch {
    return loginError(request, "oauth_unavailable");
  }
}
export async function finishOAuth(request: Request, provider: string) {
  let validState = false;
  try {
    const cfg = config(provider, request),
      store = await cookies(),
      url = new URL(request.url);
    const raw = store.get(`hams_oauth_${cfg.key}`)?.value;
    store.set(`hams_oauth_${cfg.key}`, "", { ...cookieOptions, maxAge: 0 });
    const saved = raw
      ? (JSON.parse(raw) as { state: string; verifier: string })
      : null;
    if (
      !saved ||
      !url.searchParams.get("state") ||
      saved.state !== url.searchParams.get("state")
    )
      throw new Error("invalid_state");
    validState = true;
    if (url.searchParams.has("error") || !url.searchParams.get("code"))
      throw new Error("denied");
    await rateLimit(`oauth:${cfg.key}:${saved.state}`, 2);
    const tokenResponse = await fetch(cfg.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: cfg.id,
        redirect_uri: cfg.redirect,
        code: url.searchParams.get("code")!,
        state: saved.state,
        ...(cfg.secret ? { client_secret: cfg.secret } : {}),
        ...(cfg.key === "google" ? { code_verifier: saved.verifier } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || typeof token.access_token !== "string")
      throw new Error("token_failed");
    const profileResponse = await fetch(cfg.profile, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const rawProfile = await profileResponse.json();
    if (!profileResponse.ok) throw new Error("profile_failed");
    const profile = cfg.key === "naver" ? rawProfile.response : rawProfile;
    if (!profile || (cfg.key === "naver" && rawProfile.resultcode !== "00"))
      throw new Error("profile_failed");
    const providerId = String(
      cfg.key === "google" ? (profile.sub ?? "") : (profile.id ?? ""),
    );
    if (!providerId) throw new Error("profile_failed");
    const kakao = profile.kakao_account;
    // Providers without a verified email can still register using their stable provider ID.
    const email =
      cfg.key === "google"
        ? profile.email_verified === true
          ? profile.email
          : null
        : cfg.key === "kakao"
          ? kakao?.is_email_valid === true && kakao?.is_email_verified === true
            ? kakao.email
            : null
          : null;
    const name =
      String(
        cfg.key === "kakao"
          ? (kakao?.profile?.nickname ??
              profile.properties?.nickname ??
              "새로운 팀원")
          : (profile.name ?? profile.nickname ?? "새로운 팀원"),
      )
        .trim()
        .slice(0, 80) || "새로운 팀원";
    const existing = await db().execute({
      sql: "SELECT user_id FROM oauth_accounts WHERE provider=? AND provider_account_id=?",
      args: [cfg.key, providerId],
    });
    let user: User | null;
    const extra: InStatement[] = [];
    if (existing.rows[0])
      user = await userById(String(existing.rows[0].user_id));
    else {
      if (email) {
        const duplicate = await db().execute({
          sql: "SELECT id FROM users WHERE email=?",
          args: [String(email).toLowerCase()],
        });
        // Never silently link an existing password account by matching an email.
        if (duplicate.rows.length) return loginError(request, "account_exists");
      }
      const id = randomUUID(),
        workspaceId = randomUUID();
      user = {
        id,
        name,
        email: email ? String(email).toLowerCase() : null,
        workspaceId,
        workspaceName: `${name}의 워크스페이스`,
        role: "owner",
        plan: "free",
        accountRole: "user",
        onboardingComplete: true,
      };
      extra.push(
        ...newUserStatements(
          id,
          workspaceId,
          name,
          user.email,
          null,
          { role: "user", plan: "free", teamId: null },
          true,
        ),
      );
      extra.push({
        sql: "INSERT INTO oauth_accounts(provider,provider_account_id,user_id) VALUES (?,?,?)",
        args: [cfg.key, providerId, id],
      });
      for (const [resource, resourceId, after] of [
        ["user", id, { name }],
        [
          "workspace",
          workspaceId,
          { workspaceName: user.workspaceName, plan: "free" },
        ],
        ["workspace_member", id, { role: "owner" }],
        ["oauth_account", id, { provider: cfg.key }],
      ] as const)
        extra.push(
          ...auditStatements(request, {
            user,
            action: "CREATE",
            resource,
            resourceId,
            after,
            source: "oauth",
          }),
        );
    }
    if (!user) throw new Error("no_membership");
    await signIn(request, user, extra, "oauth");
    return NextResponse.redirect(
      new URL(
        user.onboardingComplete ? "/dashboard" : "/onboarding",
        cfg.origin,
      ),
    );
  } catch {
    if (validState) {
      try {
        await audit(request, {
          action: "OAUTH_FAILED",
          resource: "session",
          source: "oauth",
          outcome: "failure",
          errorCode: "OAUTH_CALLBACK_FAILED",
        });
      } catch {
        /* A failed audit must never create a session. */
      }
    }
    return loginError(request, "oauth_failed");
  }
}
