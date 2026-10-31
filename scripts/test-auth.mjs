// Full HTTP integration checks using an isolated SQLite DB. Never loads .env credentials.
import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createClient } from "@libsql/client";
import { checkProjects } from "./check-projects.mjs";
import { checkArtifacts } from "./check-artifacts.mjs";
import { checkIntegrated } from "./check-integrated.mjs";
import { checkRegistration } from "./check-registration.mjs";
import { checkTeamCollaboration } from "./check-team-collaboration.mjs";

const temp = await mkdtemp(join(tmpdir(), "hams-matrix-auth-"));
const dbUrl = pathToFileURL(join(temp, "test.db")).href;
const client = createClient({ url: dbUrl });
const migrationsDirectory = new URL("../db/migrations/", import.meta.url);
for (const name of (await readdir(migrationsDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  await client.executeMultiple(
    await readFile(new URL(name, migrationsDirectory), "utf8"),
  );
}
const port = Number(process.env.TEST_PORT ?? 3107),
  origin = `http://localhost:${port}`;
const development = process.argv.includes("--dev");
const loggingDisabled = process.argv.includes("--logging-disabled");
await client.execute({
  sql: "UPDATE admin_setting SET value_json=? WHERE setting_key='DB_LOGGING_ENABLED'",
  args: [loggingDisabled ? "false" : "true"],
});
// Reseeding the renamed table must preserve the configured value.
await client.executeMultiple(
  `INSERT INTO admin_setting(setting_key,value_json,value_type,category,label,description)
   VALUES ('DB_LOGGING_ENABLED','false','boolean','logging','DB audit logging','Default setting')
   ON CONFLICT(setting_key) DO NOTHING;`,
);
assert.equal(
  (
    await client.execute(
      "SELECT value_json FROM admin_setting WHERE setting_key='DB_LOGGING_ENABLED'",
    )
  ).rows[0].value_json,
  loggingDisabled ? "false" : "true",
);
await assert.rejects(
  client.execute(
    "UPDATE admin_setting SET value_json='\"true\"' WHERE setting_key='DB_LOGGING_ENABLED'",
  ),
);
const sourceRoot = process.cwd();
let serverRoot = sourceRoot;
if (development) {
  // Isolate the dev cache/lock from the developer's already-running application.
  await mkdir(resolve(".auth-tests"), { recursive: true });
  serverRoot = await mkdtemp(join(sourceRoot, ".auth-tests", "dev-"));
  for (const name of [
    "app",
    "components",
    "lib",
    "stores",
    "styles",
    "public",
    "tsconfig.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]) {
    await cp(join(sourceRoot, name), join(serverRoot, name), {
      recursive: true,
    });
  }
  const config = await readFile(join(sourceRoot, "next.config.ts"), "utf8");
  await writeFile(
    join(serverRoot, "next.config.ts"),
    config.replace(
      "turbopack: {",
      `turbopack: { root: ${JSON.stringify(sourceRoot)},`,
    ),
  );
  await symlink(
    join(sourceRoot, "node_modules"),
    join(serverRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
}
const env = {
  ...process.env,
  TURSO_DATABASE_URL: dbUrl,
  TURSO_AUTH_TOKEN: "",
  OPENAI_API_KEY: "",
  AI_IMAGE_ENCRYPTION_KEY: "",
  APP_URL: origin,
  NEXT_TELEMETRY_DISABLED: "1",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  NAVER_CLIENT_ID: "",
  NAVER_CLIENT_SECRET: "",
  KAKAO_CLIENT_ID: "",
  KAKAO_CLIENT_SECRET: "",
  // The obsolete environment variable deliberately disagrees: only the DB must control logging.
  DB_LOGGING_ENABLED: loggingDisabled ? "true" : "false",
};
// --dev runs the same checks with Next.js navigation validation enabled.
const child = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    development ? "dev" : "start",
    "--port",
    String(port),
  ],
  {
    cwd: serverRoot,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (v) => {
  logs += v;
});
child.stderr.on("data", (v) => {
  logs += v;
});
const sessionCookie = (response) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith("hams_session="))
    ?.split(";")[0];
async function request(
  path,
  {
    method = "GET",
    cookie,
    data,
    requestOrigin = origin,
    prefetch = false,
  } = {},
) {
  return fetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      ...(method === "GET"
        ? {}
        : { Origin: requestOrigin, "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(prefetch ? { Purpose: "prefetch" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
}
try {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try {
      if ((await fetch(origin + "/login")).ok) break;
    } catch {}
    if (i === 79) throw new Error(`Server did not start: ${logs}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  if (loggingDisabled) {
    // Any accidental audit INSERT will fail, including inserts inside auth/profile transactions.
    await client.execute(
      "CREATE TRIGGER test_no_audit_writes BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'logging disabled'); END",
    );
    const data = {
      role: "user",
      plan: "free",
      teamId: null,
      name: "로그 비활성 테스트",
      email: "no-logs@example.test",
      password: "Testpass123!",
      accepted: true,
    };
    const signup = await request("/api/auth/signup", { method: "POST", data });
    assert.equal(signup.status, 201, await signup.clone().text());
    let cookie = sessionCookie(signup);
    assert.ok(cookie);
    assert.equal((await request("/api/me", { cookie })).status, 200);
    assert.equal(
      (
        await request("/api/me", {
          method: "PATCH",
          cookie,
          data: { name: "변경된 이름" },
        })
      ).status,
      200,
    );
    const dashboard = await request("/dashboard", { cookie });
    assert.equal(dashboard.status, 200);
    assert.ok((await dashboard.text()).includes("변경된 이름"));
    const activity = await request("/api/activity", { cookie });
    assert.equal(activity.status, 200);
    assert.deepEqual((await activity.json()).events, []);
    assert.equal(
      (
        await request("/api/auth/login", {
          method: "POST",
          data: { ...data, password: "wrong" },
        })
      ).status,
      401,
    );
    const login = await request("/api/auth/login", { method: "POST", data });
    assert.equal(login.status, 200);
    cookie = sessionCookie(login);
    assert.equal(
      (await request("/api/auth/logout", { method: "POST", cookie })).status,
      200,
    );
    assert.equal((await request("/api/me", { cookie })).status, 401);
    assert.equal(
      (await client.execute("SELECT count(*) AS n FROM audit_logs")).rows[0].n,
      0,
    );
    console.log(
      "PASS: logging disabled writes no audit rows; signup, reads, profile updates, login and logout still work.",
    );
  } else {
    assert.equal((await request("/api/me")).status, 401);
    const protectedPage = await request("/dashboard");
    if (protectedPage.status === 200) {
      // PPR streams the shell before authentication resolves: redirect is then sent in HTML.
      const html = await protectedPage.text();
      assert.match(
        html,
        /(?:NEXT_REDIRECT|http-equiv="refresh")[\s\S]*\/login/,
      );
      assert.ok(!html.includes('class="welcome-banner"'));
    } else {
      assert.equal(protectedPage.status, 307);
      assert.match(protectedPage.headers.get("location"), /\/login$/);
    }
    assert.equal(
      (
        await request("/api/auth/signup", {
          method: "POST",
          requestOrigin: "https://other.example",
          data: {},
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("/api/auth/signup", {
          method: "POST",
          data: {
            name: "테스트",
            email: "bad",
            password: "Testpass123!",
            accepted: true,
          },
        })
      ).status,
      400,
    );
    const credentials = {
      role: "user",
      plan: "free",
      teamId: null,
      name: "테스트 사용자",
      email: "Member@Example.test",
      password: "Testpass123!",
      accepted: true,
    };
    const signup = await request("/api/auth/signup", {
      method: "POST",
      data: credentials,
    });
    assert.equal(signup.status, 201, await signup.clone().text());
    const firstCookie = sessionCookie(signup);
    assert.ok(firstCookie);
    assert.match(signup.headers.getSetCookie().join(" "), /HttpOnly/i);
    assert.match(signup.headers.getSetCookie().join(" "), /SameSite=lax/i);
    const first = (await signup.json()).user;
    assert.equal(first.email, "member@example.test");
    assert.equal(first.role, "owner");
    assert.equal(
      (await request("/api/auth/signup", { method: "POST", data: credentials }))
        .status,
      409,
    );
    assert.equal(
      (
        await request("/api/auth/login", {
          method: "POST",
          data: { email: credentials.email, password: "wrong" },
        })
      ).status,
      401,
    );
    const login = await request("/api/auth/login", {
      method: "POST",
      data: credentials,
    });
    assert.equal(login.status, 200);
    const loginCookie = sessionCookie(login);
    assert.ok(loginCookie);
    assert.equal(
      (await request("/api/me", { cookie: loginCookie })).status,
      200,
    );
    const stored = (
      await client.execute({
        sql: "SELECT password_hash FROM users WHERE id=?",
        args: [first.id],
      })
    ).rows[0];
    assert.ok(String(stored.password_hash).startsWith("scrypt:"));
    assert.ok(!String(stored.password_hash).includes(credentials.password));
    const token = loginCookie.split("=")[1];
    assert.equal(
      (
        await client.execute({
          sql: "SELECT count(*) AS n FROM sessions WHERE token_hash=?",
          args: [createHash("sha256").update(token).digest("hex")],
        })
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await request("/api/me", {
          method: "PATCH",
          cookie: loginCookie,
          data: { name: "변경된 이름" },
        })
      ).status,
      200,
    );
    const updates = (
      await client.execute({
        sql: "SELECT * FROM audit_logs WHERE actor_id=? AND action='UPDATE'",
        args: [first.id],
      })
    ).rows;
    assert.equal(updates.length, 1);
    assert.deepEqual(JSON.parse(updates[0].before_json), {
      name: credentials.name,
    });
    assert.deepEqual(JSON.parse(updates[0].after_json), {
      name: "변경된 이름",
    });
    // Audit write failure must roll back the profile mutation, not leave an untracked update.
    await client.execute(
      "CREATE TRIGGER test_reject_audit BEFORE INSERT ON audit_logs WHEN NEW.action='UPDATE' BEGIN SELECT RAISE(ABORT,'test audit failure'); END",
    );
    assert.equal(
      (
        await request("/api/me", {
          method: "PATCH",
          cookie: loginCookie,
          data: { name: "롤백될 이름" },
        })
      ).status,
      500,
    );
    assert.equal(
      (
        await client.execute({
          sql: "SELECT name FROM users WHERE id=?",
          args: [first.id],
        })
      ).rows[0].name,
      "변경된 이름",
    );
    await client.execute("DROP TRIGGER test_reject_audit");
    await assert.rejects(
      client.execute("UPDATE audit_logs SET actor_name='tampered'"),
    );
    await assert.rejects(client.execute("DELETE FROM audit_logs"));
    const second = await request("/api/auth/signup", {
      method: "POST",
      data: {
        ...credentials,
        email: "other@example.test",
        name: "다른 사용자",
      },
    });
    assert.equal(second.status, 201);
    const secondCookie = sessionCookie(second),
      secondUser = (await second.json()).user;
    // Existing artifact/history scenarios use explicit paid test subscriptions.
    await client.execute("UPDATE user_subscriptions SET plan_code='business'");
    await checkProjects({
      request,
      client,
      cookie: loginCookie,
      user: first,
      outsider: secondUser,
    });
    await checkArtifacts({
      request,
      client,
      cookie: loginCookie,
      user: first,
      otherCookie: secondCookie,
    });
    await checkIntegrated({
      request,
      client,
      cookie: loginCookie,
      user: first,
      otherCookie: secondCookie,
    });
    const otherProjects = await request(
      `/api/projects?workspaceId=${first.workspaceId}`,
      { cookie: secondCookie },
    );
    assert.deepEqual((await otherProjects.json()).projects, []);
    await checkRegistration({
      request,
      client,
      owner: first,
      ownerCookie: loginCookie,
      otherOwner: secondUser,
      otherCookie: secondCookie,
      sessionCookie,
    });
    await checkTeamCollaboration({ request, client, sessionCookie });
    const activity = await request("/api/activity", { cookie: secondCookie });
    assert.equal(activity.status, 200);
    const activityBody = await activity.json();
    assert.ok(activityBody.events.every((e) => e.actor_name === "다른 사용자"));
    assert.notEqual(secondUser.workspaceId, first.workspaceId);
    // Tampering with input does not select another tenant.
    const isolated = await request(
      `/api/activity?workspaceId=${first.workspaceId}`,
      { cookie: secondCookie },
    );
    assert.ok(
      (await isolated.json()).events.every(
        (e) => e.actor_name === "다른 사용자",
      ),
    );
    for (const path of [
      "/dashboard",
      "/requirements",
      "/screens",
      "/specifications",
      "/history",
      "/deliverables",
      "/team",
    ]) {
      const page = await request(path, { cookie: loginCookie });
      assert.equal(page.status, 200, path);
      const html = await page.text();
      assert.ok(html.includes("hams"));
      assert.match(html, /aria-label="다크 모드"/);
      assert.match(html, /role="switch"/);
      const prefetchedPage = await request(path, {
        cookie: loginCookie,
        prefetch: true,
      });
      assert.equal(prefetchedPage.status, 200, `${path} prefetch`);
      assert.doesNotMatch(
        await prefetchedPage.text(),
        /blocking-prerender-current-time|encountered the unstable value/,
      );
    }
    const logout = await request("/api/auth/logout", {
      method: "POST",
      cookie: loginCookie,
    });
    assert.equal(logout.status, 200);
    assert.equal(
      (await request("/api/me", { cookie: loginCookie })).status,
      401,
    );
    assert.equal(
      (await request("/api/me", { cookie: firstCookie })).status,
      200,
    ); // Other session remains valid.
    await client.execute({
      sql: "UPDATE sessions SET expires_at=? WHERE user_id=?",
      args: ["2000-01-01T00:00:00.000Z", first.id],
    });
    assert.equal(
      (await request("/api/me", { cookie: firstCookie })).status,
      401,
    );
    const oauth = await request("/api/auth/oauth/google");
    assert.equal(oauth.status, 307);
    assert.match(oauth.headers.get("location"), /oauth_unavailable/);
    for (let i = 0; i < 11; i++)
      await request("/api/auth/login", {
        method: "POST",
        data: { email: "limit@example.test", password: "invalid" },
      });
    assert.equal(
      (
        await request("/api/auth/login", {
          method: "POST",
          data: { email: "limit@example.test", password: "invalid" },
        })
      ).status,
      429,
    );
    const rows = (await client.execute("SELECT * FROM audit_logs")).rows;
    const json = JSON.stringify(rows);
    assert.ok(!json.includes(credentials.password));
    assert.ok(!json.includes(token));
    assert.ok(!json.includes("scrypt:"));
    const signupAudits = rows.filter(
      (r) => r.actor_id === first.id && r.route === "/api/auth/signup",
    );
    assert.equal(new Set(signupAudits.map((r) => r.request_id)).size, 1);
    if (development) await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.doesNotMatch(
      logs,
      /blocking-prerender|encountered (?:the unstable value|uncached data)|Only plain objects can be passed to Client Components|Classes or other objects with methods/,
    );
    const beforeToggle = Number(
      (await client.execute("SELECT count(*) AS n FROM audit_logs")).rows[0].n,
    );
    await client.execute(
      "UPDATE admin_setting SET value_json='false' WHERE setting_key='DB_LOGGING_ENABLED'",
    );
    assert.equal(
      (await request("/api/me", { cookie: secondCookie })).status,
      200,
    );
    assert.equal(
      (
        await request("/api/me", {
          method: "PATCH",
          cookie: secondCookie,
          data: { name: "DB 설정 변경 확인" },
        })
      ).status,
      200,
    );
    assert.equal(
      Number(
        (await client.execute("SELECT count(*) AS n FROM audit_logs")).rows[0]
          .n,
      ),
      beforeToggle,
    );
    await client.execute(
      "UPDATE admin_setting SET value_json='true' WHERE setting_key='DB_LOGGING_ENABLED'",
    );
    assert.equal(
      (await request("/api/me", { cookie: secondCookie })).status,
      200,
    );
    assert.equal(
      Number(
        (await client.execute("SELECT count(*) AS n FROM audit_logs")).rows[0]
          .n,
      ),
      beforeToggle + 1,
    );
    console.log(
      "PASS: signup, login, protected routes, profile snapshots, audit rollback, immutable logs, tenant isolation, logout, expiry, throttling, OAuth configuration and 7 published pages.",
    );
  }
} catch (error) {
  console.error(logs.slice(-6000));
  throw error;
} finally {
  client.close();
  if (child.exitCode === null) {
    if (process.platform === "win32" && development) {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else child.kill();
    await new Promise((r) => child.once("exit", r));
  }
  console.log("Isolated test database retained in OS temp directory.");
}
