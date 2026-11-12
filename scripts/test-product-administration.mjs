// Isolated SQLite, real auth/policies/handlers, and a private in-process payment adapter.
// Does not read .env, contact the live database, send notifications externally or charge money.
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
const folder = await mkdtemp(join(tmpdir(), "matrix-products-"));
const client = createClient({
  url: pathToFileURL(join(folder, "test.db")).href,
  timeout: 5000,
});
const require = createRequire(import.meta.url),
  cache = new Map();
process.env.APP_URL = "http://test.local";
let token = "master-session";
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => client };
  if (cache.has(file)) return cache.get(file).exports;
  if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
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
      if (!target) throw new Error(base);
      return load(target);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const one = async (sql, args = []) =>
  (await client.execute({ sql, args })).rows[0];
// Invoke the actual route exports with async params. Framework matching and
// automatic 404/405/HEAD/OPTIONS are verified separately against Next itself.
const routeFiles = (await readdir("app/api", { recursive: true }))
  .filter(
    (file) => /(?:^|[\\/])route\.ts$/.test(file) && !file.includes("[..."),
  )
  .map((file) => ({
    file: resolve("app/api", file),
    parts: ["api", ...file.replaceAll("\\", "/").split("/").slice(0, -1)],
  }))
  .sort(
    (a, b) =>
      b.parts.filter((p) => !p.startsWith("[")).length -
      a.parts.filter((p) => !p.startsWith("[")).length,
  );
async function routeCall(path, method = "GET", input, query = "", origin) {
  const parts = path.split("/").filter(Boolean);
  const match = routeFiles.find(
    (route) =>
      route.parts.length === parts.length &&
      route.parts.every((p, i) => p.startsWith("[") || p === parts[i]),
  );
  assert.ok(match, `Missing route: ${path}`);
  const params = Object.fromEntries(
    match.parts.flatMap((p, i) =>
      p.startsWith("[") ? [[p.slice(1, -1), parts[i]]] : [],
    ),
  );
  const action = load(match.file)[method];
  assert.equal(typeof action, "function", `Missing ${method}: ${match.file}`);
  return action(req(path + query, method, input, origin), {
    params: Promise.resolve(params),
  });
}
function req(
  path,
  method = "GET",
  input,
  origin = "http://test.local",
  extra = {},
) {
  return new Request(`http://test.local${path}`, {
    method,
    headers: { origin, "Content-Type": "application/json", ...extra },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}
async function json(response, status = 200) {
  const r = await response;
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  return d;
}
async function session(userId, workspaceId) {
  const value = `${userId}-session`;
  await client.execute({
    sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
    args: [
      value,
      createHash("sha256").update(value).digest("hex"),
      userId,
      workspaceId,
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
    ],
  });
  return value;
}
async function newUser(auth, id, role = "user") {
  for (const s of auth.newUserStatements(
    id,
    `${id}-ws`,
    id,
    `${id}@example.test`,
    null,
    { role: "user", plan: "free", teamId: null },
  ))
    await client.execute(s);
  if (role !== "user")
    await client.execute({
      sql: "UPDATE users SET account_role=? WHERE id=?",
      args: [role, id],
    });
  await session(id, `${id}-ws`);
}
try {
  await client.execute("PRAGMA foreign_keys=ON");
  const files = (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const f of files.filter((n) => n < "041"))
    await client.executeMultiple(
      await readFile(join("db/migrations", f), "utf8"),
    );
  await client.executeMultiple(
    "INSERT INTO users(id,name,account_role) VALUES ('master','master','master'),('legacy-admin','Legacy admin','admin');INSERT INTO workspaces(id,name,owner_id) VALUES ('master-ws','Master','master');INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('master-ws','master','owner');UPDATE users SET active_workspace_id='master-ws' WHERE id='master';",
  );
  const before = JSON.stringify(
    (await client.execute("SELECT id,name,account_role FROM users ORDER BY id"))
      .rows,
  );
  const migration = await readFile(
    "db/migrations/041_product_administration.sql",
    "utf8",
  );
  const tx = await client.transaction("write");
  try {
    await tx.executeMultiple(migration);
    await tx.rollback();
  } finally {
    tx.close();
  }
  assert.equal(
    JSON.stringify(
      (
        await client.execute(
          "SELECT id,name,account_role FROM users ORDER BY id",
        )
      ).rows,
    ),
    before,
  );
  await client.executeMultiple(migration);
  assert.equal(
    (await one("SELECT account_role FROM users WHERE id='master'"))
      .account_role,
    "master",
  );
  assert.equal(
    (await one("SELECT account_role FROM users WHERE id='legacy-admin'"))
      .account_role,
    "admin",
  );
  await assert.rejects(
    client.execute(
      "INSERT INTO users(id,name,account_role) VALUES ('duplicate','Duplicate','master')",
    ),
  );
  await assert.rejects(
    client.execute("UPDATE users SET account_role='user' WHERE id='master'"),
  );
  await session("master", "master-ws");
  const auth = load(resolve("lib/auth.ts")),
    products = load(resolve("lib/plan-products.ts")),
    access = load(resolve("lib/product-access.ts"));
  const billing = load(resolve("lib/team-payments.ts")),
    business = load(resolve("lib/business-requests.ts")),
    plans = load(resolve("lib/plans.ts"));
  const subscription = load(resolve("app/api/me/subscription/route.ts"));
  const menu = load(resolve("lib/menus.ts"));
  await newUser(auth, "applicant");
  await newUser(auth, "buyer");
  await newUser(auth, "candidate");
  for (let i = 0; i < 24; i++) await newUser(auth, `team-member-${i}`);
  const superCall = (segments, method = "GET", input) =>
    routeCall(`/api/super-admin/${segments.join("/")}`, method, input);
  const productCall = (
    id,
    resource = "overview",
    method = "GET",
    input,
    query = "",
  ) => routeCall(`/api/admin/products/${id}/${resource}`, method, input, query);
  const master = await auth.currentUser();
  const workspaceRoute = load(resolve("app/api/me/workspace/route.ts"));
  const directTables = [
    "plan_products",
    "contracts",
    "product_members",
    "payment_orders",
    "payment_events",
    "business_requests",
    "notifications",
    "product_events",
  ];
  const directCounts = async () =>
    Promise.all(
      directTables.map(async (table) =>
        Number((await one(`SELECT count(*) AS n FROM ${table}`)).n),
      ),
    );
  const beforeDirect = await directCounts();
  for (const code of ["team", "business", "pro", "free"]) {
    const current = await auth.currentUser();
    const target = (await plans.listPlans()).find((plan) => plan.code === code);
    await json(
      subscription.PATCH(
        req("/api/me/subscription", "PATCH", {
          plan: code,
          currentPlan: current.plan,
          planVersion: target.version,
        }),
      ),
    );
    const updated = await auth.currentUser();
    assert.equal(updated.accountRole, "master");
    assert.equal(updated.plan, code);
    assert.equal(updated.productId, null);
    assert.equal(updated.workspacePlan, "free");
    assert.equal((await json(subscription.GET())).plan.code, code);
    assert.deepEqual(await directCounts(), beforeDirect);
    if (code !== "free")
      await assert.rejects(
        auth.requireUser(),
        (error) =>
          error.status === 409 &&
          error.details?.code === "WORKSPACE_PLAN_MISMATCH",
      );
    else await auth.requireUser();
    if (code === "business") {
      const created = await json(
        workspaceRoute.POST(
          req("/api/me/workspace", "POST", {
            name: "Master direct Business",
          }),
        ),
        201,
      );
      assert.equal(created.workspace.plan, "business");
      const account = await auth.requireUser();
      assert.equal(account.workspaceId, created.workspace.id);
      assert.equal(account.accountRole, "master");
      assert.equal(account.workspaceProductId, null);
      assert.equal(
        (await plans.workspacePlan("master", created.workspace.id)).code,
        "business",
      );
      await json(
        workspaceRoute.PATCH(
          req("/api/me/workspace", "PATCH", {
            workspaceId: "master-ws",
          }),
        ),
      );
    }
  }
  await client.executeMultiple(
    "INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('history-project','master-ws','History project','master','master'); INSERT OR IGNORE INTO project_members(project_id,workspace_id,user_id,role) VALUES ('history-project','master-ws','master','admin');",
  );
  for (const [id, actor, name] of [
    ["history-master", "master", "History_100%"],
    ["history-other", "candidate", "Other history actor"],
  ])
    await client.execute({
      sql: "INSERT INTO audit_logs(id,occurred_at,request_id,workspace_id,actor_id,actor_name,actor_type,action,resource_type,outcome,source,http_method,route,before_json,after_json) VALUES (?,?,'history-test','master-ws',?,?,'user','UPDATE','test','success','web','PATCH','/test','{\"name\":\"before\"}','{\"name\":\"after\"}')",
      args: [id, new Date().toISOString(), actor, name],
    });
  const searchHistory = async (query) =>
    json(productCall("workspace", "history", "GET", undefined, query));
  assert.deepEqual(
    (
      await searchHistory("?q=History_100%25&projectId=history-project")
    ).entries.map((e) => e.id),
    ["history-master"],
  );
  assert.deepEqual(
    (
      await searchHistory("?q=candidate%40example.test&projectId=unassigned")
    ).entries.map((e) => e.id),
    ["history-other"],
  );
  assert.equal((await searchHistory("?q=not-found")).total, 0);
  await json(
    productCall(
      "workspace",
      "history",
      "GET",
      undefined,
      "?projectId=foreign-project",
    ),
    404,
  );
  await json(
    productCall(
      "workspace",
      "history",
      "GET",
      undefined,
      "?q=" + "x".repeat(101),
    ),
    400,
  );
  const historyDetail = await json(
    productCall("workspace", "history/audit/history-master"),
  );
  assert.equal(historyDetail.beforeJson.name, "before");
  assert.equal(historyDetail.afterJson.name, "after");
  const workspaceOverview = await json(productCall("workspace"));
  assert.equal(workspaceOverview.workspaces[0].id, "master-ws");
  const workspaceMembers = await json(productCall("workspace", "members"));
  assert.deepEqual(
    workspaceMembers.members.map((m) => m.id),
    ["master"],
  );
  await json(productCall("workspace", "members", "POST", {}), 405);
  const masterGuard = load(resolve("lib/guardrail-admin-access.ts"));
  assert.equal(
    (await masterGuard.guardrailAdminUser(req("/api/admin/ai-guardrails")))
      .workspaceMode,
    true,
  );
  await assert.rejects(
    access.productAdminScope(master),
    (e) => e.status === 403,
  );
  token = "applicant-session";
  await json(productCall("workspace", "members"), 403);
  const applicant = await auth.currentUser();
  await assert.rejects(access.requireSuperAdmin(), (e) => e.status === 403);
  await json(superCall(["business", "products"]), 403);
  const first = await business.submitBusinessRequest(applicant, {
    companyName: "Company A",
    contact: "applicant@example.test",
    message: "Contract request",
  });
  const again = await business.submitBusinessRequest(applicant, {
    companyName: "Company A",
    contact: "applicant@example.test",
  });
  assert.equal(first.id, again.id);
  assert.equal(
    Number((await one("SELECT count(*) AS n FROM notifications")).n),
    1,
  );
  assert.equal((await auth.currentUser()).accountRole, "user");
  assert.equal((await auth.currentUser()).plan, "free");
  token = "master-session";
  assert.deepEqual(await json(superCall(["notifications", "count"])), {
    unread: 1,
  });
  const notices = await json(superCall(["notifications"]));
  assert.equal(notices.unread, 1);
  await json(
    superCall(["notifications", notices.notifications[0].id], "PATCH", {}),
  );
  assert.equal(
    (await one("SELECT status FROM business_requests WHERE id=?", [first.id]))
      .status,
    "submitted",
  );
  assert.deepEqual(await json(superCall(["notifications", "count"])), {
    unread: 0,
  });
  const a = await json(
      superCall(["business", "products"], "POST", { name: "Business A" }),
      201,
    ),
    b = await json(
      superCall(["business", "products"], "POST", { name: "Business B" }),
      201,
    );
  assert.notEqual(a.id, b.id);
  for (const status of ["reviewing", "contracting", "approved"]) {
    const r = await one("SELECT version FROM business_requests WHERE id=?", [
      first.id,
    ]);
    await json(
      superCall(["business", "requests", first.id], "PATCH", {
        status,
        version: Number(r.version),
        ...(status === "approved" ? { productId: a.id } : {}),
      }),
    );
  }
  assert.equal(
    (await auth.userById("applicant")).plan,
    "free",
    "Approval alone cannot subscribe or promote an applicant",
  );
  const admins = [];
  for (let i = 0; i < 5; i++) {
    const d = await json(
      superCall(["business", "products", a.id, "admins"], "POST", {
        name: `Admin ${i}`,
        email: `biz-${i}@example.test`,
        password: "SyntheticPassword123",
      }),
      201,
    );
    admins.push(d.member);
    await session(d.member.id, (await auth.userById(d.member.id)).workspaceId);
  }
  const other = await json(
    superCall(["business", "products", b.id, "admins"], "POST", {
      name: "Other admin",
      email: "other-biz@example.test",
      password: "SyntheticPassword123",
    }),
    201,
  );
  await session(
    other.member.id,
    (await auth.userById(other.member.id)).workspaceId,
  );
  await json(
    superCall(["business", "products", a.id, "admins"], "POST", {
      name: "Existing",
      email: "biz-0@example.test",
      password: "SyntheticPassword123",
    }),
    409,
  );
  token = `${admins[0].id}-session`;
  const bizAdmin = await auth.currentUser();
  assert.equal(bizAdmin.accountRole, "biz_admin");
  await json(superCall(["business", "products"]), 403);
  await json(productCall(b.id), 403);
  await json(productCall(a.id));
  await client.execute({
    sql: "INSERT INTO product_events(id,product_id,actor_id,action,target_id,before_json,after_json) VALUES ('history-product',?,?,'UPDATE','candidate','{}','{}')",
    args: [a.id, bizAdmin.id],
  });
  const productHistory = await json(
    productCall(a.id, "history", "GET", undefined, "?q=biz-0%40example.test"),
  );
  assert.ok(productHistory.entries.some((e) => e.id === "history-product"));
  assert.equal(
    (
      await json(
        productCall(
          a.id,
          "history",
          "GET",
          undefined,
          "?q=no-such-history-actor",
        ),
      )
    ).total,
    0,
  );
  await json(
    productCall(
      a.id,
      "history",
      "GET",
      undefined,
      "?projectId=foreign-project",
    ),
    404,
  );
  const candidate = await json(
    productCall(
      a.id,
      "candidates",
      "GET",
      undefined,
      "?email=candidate%40example.test",
    ),
  );
  assert.equal(candidate.members.length, 1);
  // The legacy aliases remain product-scoped reads; PATCH never gains writes.
  assert.deepEqual(
    await json(routeCall(`/api/admin/products/${a.id}`)),
    await json(productCall(a.id)),
  );
  assert.deepEqual(
    await json(routeCall("/api/admin/products/me")),
    await json(routeCall(`/api/admin/products/${a.id}`)),
  );
  assert.deepEqual(
    await json(routeCall("/api/admin/members")),
    await json(productCall(a.id, "members")),
  );
  const aliasDetail = await json(
    routeCall(`/api/admin/members/${bizAdmin.id}`),
  );
  assert.equal(aliasDetail.member.id, bizAdmin.id);
  assert.equal(aliasDetail.canEditRole, false);
  await json(routeCall(`/api/admin/members/${other.member.id}`), 404);
  await json(
    routeCall(
      `/api/admin/members/${bizAdmin.id}`,
      "GET",
      undefined,
      "?q=no-match",
    ),
    404,
  );
  await json(routeCall("/api/admin/members", "PATCH", {}), 405);
  await json(
    routeCall("/api/admin/members", "PATCH", {}, "", "http://foreign.test"),
    403,
  );
  assert.deepEqual(
    await json(routeCall("/api/admin/history")),
    await json(productCall(a.id, "history")),
  );
  assert.equal(
    (await json(routeCall("/api/admin/history/product/history-product"))).id,
    "history-product",
  );
  await json(productCall(b.id, "history/product/history-product"), 403);
  await json(productCall(a.id, "history/audit/history-master"), 404);
  await json(productCall(a.id, "history/secrets/history-product"), 404);
  await json(
    productCall(a.id, "members", "GET", undefined, "?pageSize=200"),
    400,
  );
  assert.equal(
    (await json(productCall(a.id, "members", "GET", undefined, "?q=%25")))
      .total,
    0,
  );
  assert.equal(
    (await json(productCall(a.id, "members", "GET", undefined, "?page=999")))
      .page,
    1,
  );
  assert.equal(
    (
      await json(
        productCall(
          a.id,
          "candidates",
          "GET",
          undefined,
          "?email=%20CANDIDATE%40EXAMPLE.TEST%20",
        ),
      )
    ).members.length,
    1,
  );
  await json(
    productCall(a.id, "candidates", "GET", undefined, "?email=invalid"),
    400,
  );
  await json(
    routeCall(
      `/api/admin/products/${a.id}/members`,
      "POST",
      {},
      "",
      "http://foreign.test",
    ),
    403,
  );
  const memberPost = load(
    resolve("app/api/admin/products/[productId]/members/route.ts"),
  ).POST;
  for (const [raw, status] of [
    ["{", 400],
    ["x".repeat(10001), 413],
  ]) {
    await json(
      memberPost(
        new Request(`http://test.local/api/admin/products/${a.id}/members`, {
          method: "POST",
          headers: { origin: "http://test.local" },
          body: raw,
        }),
        { params: Promise.resolve({ productId: a.id }) },
      ),
      status,
    );
  }
  await json(
    productCall(a.id, "members", "POST", {
      action: "grant",
      userId: "candidate",
      version: candidate.members[0].version,
    }),
  );
  assert.equal((await auth.userById("candidate")).accountRole, "user");
  assert.equal((await auth.userById("candidate")).productId, a.id);
  await json(
    productCall(a.id, "members", "POST", {
      action: "grant",
      userId: "buyer",
      accountRole: "biz_admin",
      version: 1,
    }),
    400,
  );
  const workspaceApi = load(resolve("app/api/me/workspace/route.ts"));
  const wa = (
    await json(
      workspaceApi.POST(
        req("/api/me/workspace", "POST", { name: "Business A workspace" }),
      ),
      201,
    )
  ).workspace;
  assert.equal(
    (await one("SELECT product_id FROM workspaces WHERE id=?", [wa.id]))
      .product_id,
    a.id,
  );
  const actualBiz = await auth.currentUser();
  await plans.workspacePlan(actualBiz.id, wa.id);
  token = `${other.member.id}-session`;
  await client.execute({
    sql: "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,'viewer')",
    args: [wa.id, other.member.id],
  });
  await assert.rejects(
    plans.workspacePlan(other.member.id, wa.id),
    (e) => e.details?.code === "WORKSPACE_PLAN_MISMATCH",
  );
  const wb = (
    await json(
      workspaceApi.POST(
        req("/api/me/workspace", "POST", { name: "Business B workspace" }),
      ),
      201,
    )
  ).workspace;
  token = `${admins[0].id}-session`;
  await client.execute({
    sql: "INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('locked',?,'Locked',?,?)",
    args: [wa.id, admins[0].id, admins[0].id],
  });
  await client.execute({
    sql: "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,'candidate','member')",
    args: [wa.id],
  });
  await client.execute({
    sql: "INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('locked',?,?,'admin'),('locked',?,'candidate','member')",
    args: [wa.id, admins[0].id, wa.id],
  });
  await assert.rejects(
    client.execute({
      sql: "UPDATE projects SET owner_id='candidate' WHERE id='locked'",
      args: [],
    }),
  );
  const teamMembers = load(resolve("app/api/team/members/route.ts"));
  await json(
    teamMembers.PATCH(
      req("/api/team/members", "PATCH", {
        projectId: "locked",
        userId: "candidate",
        role: "owner",
        confirmTransfer: true,
        expectedOwnerId: admins[0].id,
      }),
    ),
    403,
  );
  assert.equal(
    (await one("SELECT owner_id FROM projects WHERE id='locked'")).owner_id,
    admins[0].id,
  );
  await json(
    productCall(
      a.id,
      "members",
      "GET",
      undefined,
      "?projectId=foreign-project",
    ),
    404,
  );
  const filtered = await json(
    productCall(a.id, "members", "GET", undefined, "?projectId=locked"),
  );
  assert.equal(filtered.total, 2);
  token = `${other.member.id}-session`;
  await json(productCall(a.id, `members/${admins[0].id}`), 403);
  token = "buyer-session";
  const buyer = await auth.currentUser();
  assert.equal(billing.teamPaymentStatus().configured, false);
  await assert.rejects(
    billing.createTeamOrder(buyer, { billingCycle: "monthly" }),
    (e) => e.status === 503 && e.details?.code === "PAYMENT_NOT_CONFIGURED",
  );
  assert.equal((await auth.currentUser()).accountRole, "user");
  const teamPlan = (await plans.listPlans()).find((p) => p.code === "team");
  await json(
    subscription.PATCH(
      req("/api/me/subscription", "PATCH", {
        plan: "team",
        currentPlan: "free",
        planVersion: teamPlan.version,
      }),
    ),
    409,
  );
  billing.registerTeamPaymentProvider({
    name: "isolated-adapter",
    createCheckout: async (order) => ({
      checkoutUrl: `https://payments.example.test/${order.id}`,
    }),
    verify: async (request) => {
      if (request.headers.get("x-test-verification") !== "verified")
        throw new auth.HttpError(403, "Unverified callback");
      return request.json();
    },
  });
  const order = await billing.createTeamOrder(buyer, {
    billingCycle: "monthly",
  });
  const row = await one("SELECT * FROM payment_orders WHERE id=?", [
    order.orderId,
  ]);
  const receipt = {
    orderId: order.orderId,
    eventId: "event-1",
    paymentId: "payment-1",
    userId: buyer.id,
    amount: Number(row.amount),
    currency: "KRW",
    status: "paid",
  };
  await assert.rejects(
    billing.processTeamPayment(
      req("/api/payments/team/webhook", "POST", receipt),
    ),
    (e) => e.status === 403,
  );
  const callback = () =>
    billing.processTeamPayment(
      req("/api/payments/team/webhook", "POST", receipt, undefined, {
        "x-test-verification": "verified",
      }),
    );
  const paid = await callback();
  await callback();
  assert.equal(paid.status, "paid");
  assert.equal((await auth.userById("buyer")).accountRole, "team_admin");
  assert.equal(
    Number(
      (
        await one(
          "SELECT count(*) AS n FROM plan_products WHERE plan_code='team'",
        )
      ).n,
    ),
    1,
  );
  const tp = paid.productId;
  for (let i = 0; i < 18; i++) {
    const u = await one("SELECT management_version FROM users WHERE id=?", [
      `team-member-${i}`,
    ]);
    await products.changeProductMember(await auth.currentUser(), tp, {
      action: "grant",
      userId: `team-member-${i}`,
      version: Number(u.management_version),
    });
  }
  const concurrent = await Promise.allSettled(
    [18, 19].map((i) =>
      products.changeProductMember(buyer, tp, {
        action: "grant",
        userId: `team-member-${i}`,
        version: 1,
      }),
    ),
  );
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    Number(
      (
        await one(
          "SELECT count(*) AS n FROM product_members WHERE product_id=? AND status='active'",
          [tp],
        )
      ).n,
    ),
    20,
  );
  assert.equal((await auth.userById("team-member-0")).accountRole, "user");
  token = `${admins[0].id}-session`;
  // Business has no 20-person cap, independently of the Team product.
  for (let i = 0; i < 22; i++) {
    await newUser(auth, `business-member-${i}`);
    await products.changeProductMember(await auth.currentUser(), a.id, {
      action: "grant",
      userId: `business-member-${i}`,
      version: 1,
    });
  }
  assert.ok(
    Number(
      (
        await one(
          "SELECT count(*) AS n FROM product_members WHERE product_id=?",
          [a.id],
        )
      ).n,
    ) > 20,
  );
  const guarded = load(resolve("lib/guardrail-admin-access.ts"));
  const scoped = await guarded.guardrailAdminUser(
    req(`/api/admin/ai-guardrails?workspaceId=${wa.id}`),
  );
  assert.equal(scoped.workspaceId, wa.id);
  await assert.rejects(
    guarded.guardrailAdminUser(
      req(`/api/admin/ai-guardrails?workspaceId=${wb.id}`),
    ),
    (e) => e.status === 404,
  );
  const legacy = await auth.userById("legacy-admin");
  if (legacy)
    await assert.rejects(
      access.productAdminScope(legacy),
      (e) => e.status === 403,
    );
  const userShape = {
    ...buyer,
    workspaceProductId: null,
    productId: null,
    teamSharingEnabled: false,
  };
  for (const [role, admin, superAdmin] of [
    ["user", false, false],
    ["admin", false, false],
    ["master", true, true],
    ["biz_admin", true, false],
    ["team_admin", true, false],
  ]) {
    const u = {
      ...userShape,
      accountRole: role,
      productId: role.endsWith("_admin") ? a.id : null,
    };
    assert.equal(
      menu.canUseNavigation(
        menu.navigationMenus.find((m) => m.key === "admin"),
        u,
      ),
      admin,
    );
    assert.equal(
      menu.canUseNavigation(
        menu.navigationMenus.find((m) => m.key === "super-admin"),
        u,
      ),
      superAdmin,
    );
    assert.equal(
      menu.canUseNavigation(
        menu.navigationMenus.find((m) => m.key === "settings"),
        u,
      ),
      true,
    );
  }
  token = "master-session";
  const notificationCount = load(
    resolve("app/api/me/notifications/count/route.ts"),
  );
  assert.deepEqual(await json(notificationCount.GET()), { unread: 0 });
  await client.executeMultiple(
    "UPDATE plans SET team_sharing_enabled=1 WHERE code='free'; INSERT INTO team_join_requests(id,workspace_id,user_id,status,requested_at) VALUES ('header-pending','master-ws','applicant','pending','2026-11-11T00:00:00.000Z'),('header-foreign','candidate-ws','buyer','pending','2026-11-11T00:00:00.000Z'); INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('master-ws','applicant','viewer');",
  );
  assert.deepEqual(await json(notificationCount.GET()), { unread: 1 });
  token = "applicant-session";
  await client.execute(
    "UPDATE sessions SET workspace_id='master-ws' WHERE user_id='applicant'",
  );
  assert.deepEqual(await json(notificationCount.GET()), { unread: 1 });
  await json(superCall(["notifications", "count"]), 403);
  await client.execute(
    "UPDATE team_join_requests SET status='rejected' WHERE id='header-pending'",
  );
  assert.deepEqual(await json(notificationCount.GET()), { unread: 0 });
  const mapped = await one(
    "SELECT product_id FROM workspaces WHERE id='master-ws'",
  );
  assert.equal(
    mapped.product_id,
    null,
    "Legacy workspaces must not be assigned arbitrarily",
  );
  token = "master-session";
  await json(
    superCall(["team", "products"], "POST", { name: "Forbidden" }),
    404,
  );
  await json(superCall(["unknown", "products"]), 404);
  await json(superCall(["team", "products", a.id]), 404);
  for (const reserved of ["me", "workspace"])
    await json(superCall(["business", "products", reserved]), 404);
  await json(
    superCall([
      "business",
      "products",
      b.id,
      "history",
      "product",
      "history-product",
    ]),
    404,
  );
  await json(superCall(["notifications", "missing-notice"], "PATCH", {}), 404);
  await json(
    routeCall(
      `/api/super-admin/business/products/${a.id}`,
      "PATCH",
      {},
      "",
      "http://foreign.test",
    ),
    403,
  );
  const productVersion = Number(
    (await one("SELECT version FROM plan_products WHERE id=?", [a.id])).version,
  );
  await json(
    superCall(["business", "products", a.id], "PATCH", {
      status: "suspended",
      version: productVersion,
    }),
  );
  await json(superCall(["business", "products", a.id]), 404);
  await json(
    superCall(["business", "products", a.id], "PATCH", {
      status: "active",
      version: productVersion + 1,
    }),
  );
  await json(
    superCall(["business", "products", a.id], "PATCH", {
      status: "active",
      version: productVersion,
    }),
    409,
  );
  await json(
    superCall(["business", "products", a.id], "PATCH", {
      status: "invalid",
      version: productVersion + 2,
    }),
    400,
  );
  await client.execute({
    sql: "UPDATE contracts SET ends_at='2020-01-01T00:00:00.000Z' WHERE product_id=?",
    args: [a.id],
  });
  await json(superCall(["business", "products", a.id]), 404);
  await client.execute({
    sql: "UPDATE contracts SET ends_at=NULL WHERE product_id=?",
    args: [a.id],
  });
  // Model a legacy Business workspace that existed before its owner joined a
  // product. The insert trigger links already-supported owners automatically.
  await newUser(auth, "mapping-owner");
  await client.execute({
    sql: "INSERT INTO workspaces(id,name,owner_id,plan,subscription_plan) VALUES ('legacy-route','Legacy route',?,'business','business')",
    args: ["mapping-owner"],
  });
  await client.execute(
    "UPDATE workspaces SET plan='business',subscription_plan='business' WHERE id='legacy-route'",
  );
  await products.changeProductMember(
    await auth.currentUser(),
    a.id,
    {
      userId: "mapping-owner",
      action: "grant",
      version: 1,
    },
    true,
  );
  await json(
    superCall(["business", "products", a.id, "mapping"], "POST", {
      workspaceId: "legacy-route",
    }),
  );
  assert.equal(
    (await one("SELECT product_id FROM workspaces WHERE id='legacy-route'"))
      .product_id,
    a.id,
  );
  await json(
    superCall(["business", "products", a.id, "mapping"], "POST", {
      workspaceId: "legacy-route",
    }),
    409,
  );
  assert.equal(
    Number(
      (
        await one(
          "SELECT count(*) AS n FROM product_events WHERE action='legacy_workspace_mapped' AND target_id='legacy-route'",
        )
      ).n,
    ),
    1,
  );
  // Candidate throttling is keyed by actor, shared across product routes.
  const candidateBucket = auth.digest("product-candidate:master");
  await client.execute({
    sql: "INSERT INTO auth_rate_limits(bucket,attempts,resets_at) VALUES (?,30,?) ON CONFLICT(bucket) DO UPDATE SET attempts=30,resets_at=excluded.resets_at",
    args: [candidateBucket, Date.now() + 60000],
  });
  await json(superCall(["business", "products", a.id, "candidates"]), 400);
  await json(
    routeCall(
      `/api/super-admin/business/products/${a.id}/candidates`,
      "GET",
      undefined,
      "?email=buyer%40example.test",
    ),
    429,
  );
  await json(
    routeCall(
      `/api/super-admin/business/products/${b.id}/candidates`,
      "GET",
      undefined,
      "?email=buyer%40example.test",
    ),
    429,
  );
  token = "";
  const coveredRoutes = routeFiles.filter(
    ({ parts }) =>
      (parts[1] === "admin" &&
        ["products", "members", "history"].includes(parts[2])) ||
      (parts[1] === "super-admin" &&
        !["plans", "ai-guardrails"].includes(parts[2])),
  );
  let checkedMethods = 0;
  for (const route of coveredRoutes) {
    const exports = load(route.file);
    const params = Object.fromEntries(
      route.parts
        .filter((p) => p.startsWith("["))
        .map((p) => [p.slice(1, -1), "unknown"]),
    );
    const path =
      "/" +
      route.parts.map((p) => (p.startsWith("[") ? "unknown" : p)).join("/");
    for (const method of ["GET", "POST", "PATCH"].filter(
      (m) => typeof exports[m] === "function",
    )) {
      await json(
        exports[method](req(path, method), { params: Promise.resolve(params) }),
        401,
      );
      checkedMethods++;
    }
  }
  assert.ok(
    checkedMethods >= 40,
    `Expected all explicit route methods, got ${checkedMethods}`,
  );
  console.log(
    `PASS: ${checkedMethods} explicit route methods require authentication; aliases, Origin/body validation, scoped details, status recovery, legacy mapping and shared candidate throttling.`,
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    "PASS: real-auth master direct plans without products/payments/requests, frozen workspace and new Business workspace recovery, migration rollback/preservation, master constraints, isolated products, five master-created Business admins, private member/detail/project/history scopes, unlimited Business, exact-product workspace policy, immutable project owner/UI API gate, Business request/notification atomicity, no auto-promotion, unconfigured/verified/duplicate Team payments, shared 20-seat concurrency and three-menu matrix",
  );
} finally {
  client.close();
}
