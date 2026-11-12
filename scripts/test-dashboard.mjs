import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";

const fixture = await dashboardFixture(new Date("2026-11-12T03:00:00.000Z"));
const { db } = fixture;
const require = createRequire(import.meta.url),
  cache = new Map();
let token = "dash-owner-session";
let restrictScreen = false;
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => db };
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
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
      const target = [base, `${base}.ts`, `${base}.tsx`, `${base}.json`].find(
        existsSync,
      );
      if (!target) throw Error(`Missing module ${base}`);
      if (target.endsWith(".json"))
        return JSON.parse(readFileSync(target, "utf8"));
      const result = load(target);
      // READ is fixed true in today's policy. Exercise future restricted READ using the real
      // permission resolver with only its returned screen READ value narrowed (never broadened).
      if (target === resolve("lib/project-permissions.ts"))
        return {
          ...result,
          projectPermissionAccess: async (...args) => {
            const access = await result.projectPermissionAccess(...args);
            if (restrictScreen) access.permissionsByTab.screen.READ = false;
            return access;
          },
        };
      return result;
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
try {
  const auth = load(resolve("lib/auth.ts"));
  const { dashboardData } = load(resolve("lib/dashboard-query.ts"));
  const model = load(resolve("lib/dashboard-model.ts"));
  const user = await auth.requireUser();
  const get = (selected = "") => dashboardData(user, selected, db, fixture.now);
  const all = await get();
  assert.equal(all.projects.length, 2);
  assert.equal(all.projectOptions.length, 2);
  assert.equal(all.summary.artifacts, 8);
  assert.equal(all.summary.reviewing, 1);
  assert.equal(all.summary.recentChanges, 3);
  assert.equal(all.range.start, "2026-11-05T15:00:00.000Z");
  assert.equal(all.range.end, "2026-11-12T15:00:00.000Z");
  assert.equal(all.recentArtifacts.length, 4);
  assert.ok(all.recentArtifacts.every((a) => a.id !== "dash-deleted"));
  assert.equal(all.impactPreview.state, "candidate");
  assert.equal(all.impactPreview.candidate.source.code, "DASH-REQ");
  assert.equal(all.impactPreview.candidate.baselineVersion, 1);
  assert.ok(!JSON.stringify(all).includes("Secret"));
  assert.ok(!JSON.stringify(all).includes("fields_json"));
  assert.ok(!JSON.stringify(all).includes("snapshot"));
  assert.equal(all.projects.find((p) => p.id === "dash-p1").stats.completed, 1);
  assert.equal(
    all.projects.find((p) => p.id === "dash-p1").stats.wbsProgress,
    100,
  );
  const p1 = await get("dash-p1");
  assert.equal(p1.summary.artifacts, 7);
  assert.equal(p1.summary.recentChanges, 2);
  assert.equal(p1.projectOptions.length, 2);
  const p2 = await get("dash-p2");
  assert.equal(p2.summary.artifacts, 1);
  assert.equal(p2.recentActivities.length, 1);
  assert.equal(p2.impactPreview.state, "none");
  for (const id of ["missing", "dash-hidden", "dash-foreign-p"])
    await assert.rejects(get(id), (e) => e.status === 404);
  assert.equal(
    model.dashboardRange(new Date("2026-11-11T14:59:59.999Z")).endDate,
    "2026-11-11",
  );
  assert.equal(
    model.dashboardRange(new Date("2026-11-11T15:00:00.000Z")).endDate,
    "2026-11-12",
  );
  console.log(
    "PASS: scoped summary, deleted exclusion, integer versions, KST seven-day UPDATE boundaries, current rows, stable preview and real baseline candidate.",
  );
  await fixture.revision(
    fixture.artifacts.find((a) => a.id === "dash-screen"),
    fixture.requirement.updatedAt,
  );
  restrictScreen = true;
  const limited = await get("dash-p1");
  assert.equal(limited.summary.artifacts, 6);
  assert.equal(limited.summary.reviewing, 0);
  assert.equal(limited.summary.recentChanges, 2);
  assert.equal(limited.impactPreview.state, "limited");
  assert.equal(limited.projects[0].stats.acceptanceIssues, undefined);
  assert.ok(!JSON.stringify(limited).includes("dash-screen"));
  restrictScreen = false;
  const current = [
    ...fixture.artifacts.filter(
      (a) => a.projectId === "dash-p1" && a.id !== "dash-deleted",
    ),
  ];
  const complete = p1.projects;
  assert.equal(
    model.dashboardPreview(
      complete,
      current.map((a) =>
        a.id === fixture.test.id ? { ...a, structure: {} } : a,
      ),
    ).impactPreview.state,
    "none",
  );
  assert.equal(
    model.dashboardPreview(
      complete,
      current.map((a) =>
        a.id === fixture.test.id
          ? {
              ...a,
              structure: { baselines: [{ artifactId: "missing", version: 1 }] },
            }
          : a,
      ),
    ).impactPreview.state,
    "none",
  );
  assert.equal(
    model.dashboardPreview(
      complete,
      current.map((a) =>
        a.id === fixture.test.id
          ? {
              ...a,
              structure: {
                baselines: [{ artifactId: "dash-req", version: 2 }],
              },
            }
          : a,
      ),
    ).impactPreview.state,
    "none",
  );
  assert.equal(
    model.dashboardPreview(
      complete,
      current.map((a) =>
        a.id === fixture.test.id ? { ...a, status: "초안" } : a,
      ),
    ).impactPreview.state,
    "none",
  );
  console.log(
    "PASS: restricted READ excludes titles/counts, incomplete scope is explicit, missing/deleted/current baselines and unapproved results never become false change candidates.",
  );
  const route = load(resolve("app/api/dashboard/route.ts"));
  const request = (query = "") =>
    new Request(`http://test.local/api/dashboard${query}`);
  assert.equal((await route.GET(request())).status, 200);
  assert.equal(
    (await route.GET(request())).headers.get("cache-control"),
    "no-store",
  );
  assert.equal(
    (await route.GET(request("?projectId=dash-hidden"))).status,
    404,
  );
  assert.equal(
    (await route.GET(request("?projectId=dash-p1&projectId=dash-p2"))).status,
    400,
  );
  assert.equal(
    (await route.GET(request("?projectId=" + "a".repeat(101)))).status,
    400,
  );
  token = "";
  assert.equal((await route.GET(request())).status, 401);
  token = "dash-guest-session";
  assert.equal((await route.GET(request())).status, 403);
  token = "dash-viewer-session";
  assert.equal((await route.GET(request())).status, 200);
  token = "dash-empty-session";
  const empty = await (await route.GET(request())).json();
  assert.equal(empty.projects.length, 0);
  assert.equal(empty.summary.artifacts, 0);
  token = "dash-owner-session";
  await db.execute("UPDATE plans SET history_enabled=0 WHERE code='team'");
  const noHistory = await get();
  assert.equal(noHistory.summary.recentChanges, null);
  assert.equal(noHistory.recentActivities.length, 0);
  assert.ok(
    noHistory.projectOptions.every((p) => !p.readableTabs.includes("history")),
  );
  await db.execute("UPDATE plans SET history_enabled=1 WHERE code='team'");
  token = "dash-viewer-session";
  const viewer = await auth.requireUser();
  await db.execute(
    "DELETE FROM project_members WHERE user_id='dash-viewer' AND project_id='dash-p1'",
  );
  await assert.rejects(
    dashboardData(viewer, "dash-p1", db, fixture.now),
    (e) => e.status === 404,
  );
  assert.equal(
    (await dashboardData(viewer, "", db, fixture.now)).projects.length,
    0,
  );
  console.log(
    "PASS: real auth/GET, 401/403/404, duplicate/oversized IDs, viewer and empty states, plan-gated history, assignment removal, no-store.",
  );
} finally {
  db.close();
}
