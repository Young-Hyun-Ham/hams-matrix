// Real authorization and route handlers against an isolated SQLite database. Never reads .env.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import ts from "typescript";

const folder = await mkdtemp(join(tmpdir(), "matrix-team-sharing-"));
const client = createClient({
  url: pathToFileURL(join(folder, "test.db")).href,
});
process.env.APP_URL = "http://test.local";
const require = createRequire(import.meta.url),
  cache = new Map();
let token = "owner-token";
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => client };
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (name === "server-only") return {};
      if (name === "next/headers")
        return {
          cookies: async () => ({
            get: () => (token ? { value: token } : undefined),
          }),
        };
      if (name === "next/server") return { connection: async () => {} };
      if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
      const base = name.startsWith("@/")
        ? resolve(name.slice(2))
        : resolve(dirname(file), name);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw new Error(`Missing module: ${base}`);
      return load(target);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const one = async (sql, args = []) =>
  (await client.execute({ sql, args })).rows[0];
const plain = (value) => JSON.parse(JSON.stringify(value));
function request(path, method = "GET", data, origin = "http://test.local") {
  return new Request(`http://test.local${path}`, {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function expect(response, status) {
  response = await response;
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}
try {
  await client.execute("PRAGMA foreign_keys=ON");
  const files = (await readdir("db/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const migration = "034_plan_names_team_sharing.sql";
  for (const file of files.filter((name) => name < migration))
    await client.executeMultiple(
      await readFile(join("db/migrations", file), "utf8"),
    );
  await client.executeMultiple(`
    INSERT INTO users(id,name,email,account_role,onboarding_complete) VALUES
      ('owner','Owner','owner@example.test','user',1),
      ('member','Member','member@example.test','user',1),
      ('viewer','Viewer','viewer@example.test','user',1),
      ('free-user','Free user','free@example.test','user',1),
      ('outsider','Outsider','outsider@example.test','user',1),
      ('operator','Operator','operator@example.test','admin',1);
    INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Shared','owner');
    INSERT INTO workspace_members(workspace_id,user_id,role)
      SELECT 'ws',id,CASE WHEN id='owner' THEN 'owner' ELSE 'member' END FROM users;
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','ws','Shared project','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES
      ('p','ws','owner','admin'),('p','ws','member','member'),('p','ws','viewer','viewer'),('p','ws','free-user','member');
    INSERT INTO team_posts(id,workspace_id,project_id,author_id,title,body,category,created_at)
      VALUES ('post','ws','p','owner','Preserved','Body','공유','2026-11-05T00:00:00.000Z');
    INSERT INTO team_join_requests(id,workspace_id,user_id) VALUES ('join','ws','outsider');
    UPDATE user_subscriptions SET plan_code='pro' WHERE user_id IN ('owner','member','viewer','outsider');
    UPDATE plans SET monthly_price=12500,monthly_discount_price=9000,yearly_price=125000,yearly_discount_price=99000 WHERE code='plus';
  `);
  const beforePlans = plain(
    (await client.execute("SELECT * FROM plans ORDER BY code")).rows,
  );
  const beforeSubscriptions = plain(
    (await client.execute("SELECT * FROM user_subscriptions ORDER BY user_id"))
      .rows,
  );
  await client.executeMultiple(
    `BEGIN IMMEDIATE;\n${await readFile(join("db/migrations", migration), "utf8")}\nCOMMIT;`,
  );
  const afterPlans = plain(
    (await client.execute("SELECT * FROM plans ORDER BY code")).rows,
  );
  const commercial = (row) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          !["name", "version", "updated_at", "team_sharing_enabled"].includes(
            key,
          ),
      ),
    );
  for (let i = 0; i < beforePlans.length; i++) {
    assert.deepEqual(commercial(afterPlans[i]), commercial(beforePlans[i]));
    assert.equal(afterPlans[i].version, beforePlans[i].version + 1);
  }
  assert.deepEqual(
    plain(
      (
        await client.execute(
          "SELECT * FROM user_subscriptions ORDER BY user_id",
        )
      ).rows,
    ),
    beforeSubscriptions,
  );
  assert.equal((await one("SELECT COUNT(*) AS n FROM team_posts")).n, 1);
  await assert.rejects(
    client.execute("UPDATE plans SET team_sharing_enabled=2 WHERE code='free'"),
  );
  for (const id of [
    "owner",
    "member",
    "viewer",
    "free-user",
    "outsider",
    "operator",
  ])
    await client.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,'ws',?,?)",
      args: [
        id,
        createHash("sha256").update(`${id}-token`).digest("hex"),
        id,
        new Date().toISOString(),
        new Date(Date.now() + 3600000).toISOString(),
      ],
    });
  // Apply the subsequent code migration before exercising the current application.
  const oldMemberVersion = (
    await one("SELECT management_version FROM users WHERE id='free-user'")
  ).management_version;
  await client.executeMultiple(
    `BEGIN IMMEDIATE;\n${await readFile("db/migrations/035_plan_codes_pro_team.sql", "utf8")}\nCOMMIT;`,
  );
  const plans = load(resolve("lib/plans.ts")),
    auth = load(resolve("lib/auth.ts"));
  const catalog = await plans.listPlans();
  assert.deepEqual(
    catalog.map((p) => [p.code, p.name, p.teamSharingEnabled]),
    [
      ["free", "Free", false],
      ["pro", "Pro", false],
      ["team", "Team", true],
      ["business", "Business", true],
    ],
  );
  assert.equal((await auth.userById("owner")).teamSharingEnabled, true);
  assert.equal((await auth.userById("free-user")).teamSharingEnabled, false);
  const admin = load(resolve("app/api/admin/plans/route.ts"));
  token = "operator-token";
  const patch = (data, origin) =>
    admin.PATCH(request("/api/admin/plans", "PATCH", data, origin));
  for (const invalid of [undefined, null, 1, "true", {}])
    await expect(patch({ ...catalog[0], teamSharingEnabled: invalid }), 400);
  await expect(
    patch({ ...catalog[0], teamSharingEnabled: true }, "http://foreign.local"),
    403,
  );
  const updated = await expect(
    patch({ ...catalog[0], teamSharingEnabled: true }),
    200,
  );
  await expect(patch({ ...catalog[0], teamSharingEnabled: false }), 409);
  assert.equal((await auth.userById("free-user")).teamSharingEnabled, true);
  await expect(patch({ ...updated.plans[0], teamSharingEnabled: false }), 200);
  // Each plan can be toggled independently; an enabled Free is a supported configuration.
  for (const code of ["free", "pro", "team", "business"]) {
    let current = (await plans.listPlans()).find((p) => p.code === code);
    const response = await expect(
      patch({ ...current, teamSharingEnabled: !current.teamSharingEnabled }),
      200,
    );
    await expect(
      patch({
        ...response.plans.find((p) => p.code === code),
        teamSharingEnabled: current.teamSharingEnabled,
      }),
      200,
    );
  }
  const log = await one(
    "SELECT id FROM plan_change_logs WHERE resource='plan' ORDER BY created_at DESC LIMIT 1",
  );
  const detail = await load(resolve("lib/admin-history.ts")).historyDetail(
    "plan",
    log.id,
  );
  assert.equal(typeof detail.beforeJson.teamSharingEnabled, "boolean");
  assert.equal(typeof detail.afterJson.teamSharingEnabled, "boolean");
  const membersAdmin = load(resolve("app/api/admin/members/route.ts"));
  await expect(membersAdmin.GET(request("/api/admin/members?plan=plus")), 400);
  await expect(
    membersAdmin.PATCH(
      request("/api/admin/members", "PATCH", {
        userId: "free-user",
        plan: "pro",
        version: oldMemberVersion,
      }),
    ),
    409,
  );
  await expect(patch({ ...catalog[1], code: "plus" }), 400);
  await expect(
    patch({
      ...catalog[1],
      version: afterPlans.find((plan) => plan.code === "pro").version,
    }),
    409,
  );
  const subscription = load(resolve("app/api/me/subscription/route.ts"));
  token = "free-user-token";
  await expect(
    subscription.PATCH(
      request("/api/me/subscription", "PATCH", {
        plan: "pro",
        currentPlan: "free",
        planVersion: afterPlans.find((plan) => plan.code === "pro").version,
      }),
    ),
    409,
  );
  token = "operator-token";
  const listed = await expect(
    membersAdmin.GET(request("/api/admin/members")),
    200,
  );
  assert.equal(listed.members.find((u) => u.id === "owner").planName, "Team");
  assert.deepEqual(
    listed.plans.map((p) => p.name),
    ["Free", "Pro", "Team", "Business"],
  );
  const memberDetail = load(resolve("app/api/admin/members/[userId]/route.ts"));
  assert.equal(
    (
      await expect(
        memberDetail.GET(request("/api/admin/members/owner"), {
          params: Promise.resolve({ userId: "owner" }),
        }),
        200,
      )
    ).member.planName,
    "Team",
  );
  const posts = load(resolve("app/api/team/posts/route.ts"));
  const comments = load(
    resolve("app/api/team/posts/[postId]/comments/route.ts"),
  );
  const members = load(resolve("app/api/team/members/route.ts"));
  const requests = load(resolve("app/api/team/requests/route.ts"));
  const permissions = load(
    resolve("app/api/projects/[projectId]/permissions/route.ts"),
  );
  const projects = load(resolve("app/api/projects/route.ts"));
  const postContext = { params: Promise.resolve({ postId: "post" }) };
  const projectContext = { params: Promise.resolve({ projectId: "p" }) };
  const post = { projectId: "p", title: "New", body: "Body", category: "공유" };
  token = null;
  await expect(posts.GET(request("/api/team/posts?projectId=p")), 401);
  for (const id of ["free-user", "operator"]) {
    token = `${id}-token`;
    await expect(posts.GET(request("/api/team/posts?projectId=p")), 403);
    await expect(posts.GET(request("/api/team/posts")), 403);
    await expect(posts.POST(request("/api/team/posts", "POST", post)), 403);
    await expect(
      comments.GET(request("/api/team/posts/post/comments"), postContext),
      403,
    );
    await expect(
      comments.POST(
        request("/api/team/posts/post/comments", "POST", { body: "Comment" }),
        postContext,
      ),
      403,
    );
    await expect(members.GET(request("/api/team/members?projectId=p")), 403);
    await expect(
      members.POST(
        request("/api/team/members", "POST", {
          projectId: "p",
          email: "outsider@example.test",
        }),
      ),
      403,
    );
    await expect(
      members.PATCH(
        request("/api/team/members", "PATCH", {
          projectId: "p",
          userId: "viewer",
          role: "member",
          expectedRole: "viewer",
        }),
      ),
      403,
    );
    await expect(requests.GET(request("/api/team/requests")), 403);
    await expect(
      requests.PATCH(
        request("/api/team/requests", "PATCH", {
          id: "join",
          status: "approved",
        }),
      ),
      403,
    );
    await expect(
      permissions.GET(request("/api/projects/p/permissions"), projectContext),
      403,
    );
    const model = load(resolve("lib/project-permission-model.ts"));
    await expect(
      permissions.PATCH(
        request("/api/projects/p/permissions", "PATCH", {
          expectedVersion: 1,
          permissions: model.defaultRolePermissions(),
        }),
        projectContext,
      ),
      403,
    );
    const own = await expect(members.GET(request("/api/team/members")), 200);
    assert.deepEqual(
      own.members.map((u) => u.id),
      [id],
    );
    assert.equal(own.canAdd, false);
    assert.equal(own.canManage, false);
    await expect(
      projects.POST(
        request("/api/projects", "POST", {
          name: "Forbidden sharing",
          description: "",
          memberIds: ["member"],
        }),
      ),
      403,
    );
  }
  token = "free-user-token";
  await expect(
    projects.POST(
      request("/api/projects", "POST", {
        name: "Personal project",
        description: "",
        memberIds: [],
      }),
    ),
    201,
  );
  await expect(posts.GET(request("/api/team/posts?projectId=p")), 403);
  token = "member-token";
  await expect(posts.GET(request("/api/team/posts?projectId=p")), 200);
  await expect(posts.POST(request("/api/team/posts", "POST", post)), 201);
  await expect(
    comments.POST(
      request("/api/team/posts/post/comments", "POST", { body: "Allowed" }),
      postContext,
    ),
    201,
  );
  token = "viewer-token";
  await expect(posts.GET(request("/api/team/posts?projectId=p")), 200);
  await expect(posts.POST(request("/api/team/posts", "POST", post)), 403);
  await expect(
    comments.POST(
      request("/api/team/posts/post/comments", "POST", { body: "Denied" }),
      postContext,
    ),
    403,
  );
  token = "outsider-token";
  await expect(posts.GET(request("/api/team/posts?projectId=p")), 404);
  token = "operator-token";
  const freePlan = (await plans.listPlans()).find((p) => p.code === "free");
  await expect(patch({ ...freePlan, teamSharingEnabled: true }), 200);
  token = "free-user-token";
  await expect(posts.GET(request("/api/team/posts?projectId=p")), 200);
  token = "operator-token";
  const team = (await plans.listPlans()).find((p) => p.code === "team");
  const savedCounts = await one(
    "SELECT (SELECT count(*) FROM team_posts) AS posts,(SELECT count(*) FROM team_comments) AS comments,(SELECT count(*) FROM project_members) AS members",
  );
  const disabled = await expect(
    patch({ ...team, teamSharingEnabled: false }),
    200,
  );
  token = "owner-token";
  // The previously issued user DTO cannot bypass a live plan change.
  await expect(posts.POST(request("/api/team/posts", "POST", post)), 403);
  token = "operator-token";
  await expect(
    patch({
      ...disabled.plans.find((p) => p.code === "team"),
      teamSharingEnabled: true,
    }),
    200,
  );
  token = "owner-token";
  await expect(posts.GET(request("/api/team/posts?projectId=p")), 200);
  assert.deepEqual(
    await one(
      "SELECT (SELECT count(*) FROM team_posts) AS posts,(SELECT count(*) FROM team_comments) AS comments,(SELECT count(*) FROM project_members) AS members",
    ),
    savedCounts,
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    "PASS: migration preserves commercial settings/subscriptions/data; new labels/defaults; strict boolean/version/origin checks; audit and member labels; Free override and Team revocation; every protected route; no admin bypass; project roles and personal creation.",
  );
} finally {
  client.close();
}
