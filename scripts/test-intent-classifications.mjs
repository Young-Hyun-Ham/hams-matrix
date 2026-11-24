// Real handlers with isolated SQLite and synthetic identities. Never loads .env.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import ts from "typescript";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const fixture = await dashboardFixture();
const db = fixture.db,
  require = createRequire(import.meta.url),
  cache = new Map();
let token = "dash-owner-session";
process.env.APP_URL = "http://localhost:3000";
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
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
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
      const target = [base, base + ".ts", base + ".tsx"].find(existsSync);
      assert.ok(target, base);
      return load(target);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const handler = (path, method = "GET") =>
  load(resolve("app/api/" + path + "/route.ts"))[method];
const req = (path, data) =>
  new Request("http://localhost:3000" + path, {
    method: data ? "POST" : "GET",
    headers: {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
const ctx = (projectId = "dash-p1", eventId = "event-00") => ({
  params: Promise.resolve({ projectId, eventId, id: eventId }),
});
async function json(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  if (status === 200)
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response.json();
}
const list = handler("projects/[projectId]/intent-classifications"),
  detail = handler("projects/[projectId]/intent-classifications/[eventId]");
const referenceDetail = handler(
  "projects/[projectId]/intent-classifications/[eventId]/references/[referenceIndex]",
);
const refContext = (
  referenceIndex = "1",
  projectId = "dash-p1",
  eventId = "event-00",
) => ({
  params: Promise.resolve({ projectId, eventId, referenceIndex }),
});
const root = "/api/projects/dash-p1/intent-classifications";
const range = "?from=2026-11-23&to=2026-11-23";
try {
  for (let i = 0; i < 25; i++)
    await db.execute({
      sql: "INSERT INTO ai_orchestration_events(id,workspace_id,project_id,user_id,request_id,classifier_version,primary_intent,route_flags_json,reason_code,source_refs_json,fallback_code,duration_ms,created_at) VALUES (?,'dash-ws','dash-p1','dash-owner',?,1,?,?,? ,?,?,15,'2026-11-22T15:00:00.000Z')",
      args: [
        "event-" + String(i).padStart(2, "0"),
        "intent-request-" + i,
        ["rag", "realtime", "execution"][i % 3],
        JSON.stringify({
          needsRag: true,
          needsRealtime: i % 3 !== 0,
          needsExecution: i % 3 === 2,
          needsClarification: i % 2 === 0,
        }),
        i === 0 ? "FUTURE_REASON" : "PROJECT_KNOWLEDGE",
        JSON.stringify([
          {
            sourceType: "artifact",
            sourceId: "deleted-source",
            version: "1",
            chunkId: "chunk-1",
            prompt: "PRIVATE_FIELD",
          },
        ]),
        i === 0 ? "FUTURE_FALLBACK" : null,
      ],
    });
  for (const [id, date] of [
    ["before", "2026-11-22T14:59:59.999Z"],
    ["after", "2026-11-23T15:00:00.000Z"],
  ])
    await db.execute({
      sql: "INSERT INTO ai_orchestration_events SELECT ?,workspace_id,project_id,user_id,?,classifier_version,primary_intent,route_flags_json,reason_code,generation_id,source_refs_json,fallback_code,duration_ms,? FROM ai_orchestration_events WHERE id='event-00'",
      args: [id, "request-" + id, date],
    });
  const first = await json(await list(req(root + range), ctx()));
  assert.equal(first.events.length, 20);
  assert.ok(first.nextCursor);
  assert.equal(first.events[0].eventId, "event-24");
  const second = await json(
    await list(req(root + range + "&cursor=" + first.nextCursor), ctx()),
  );
  assert.equal(second.events.length, 5);
  assert.equal(second.nextCursor, null);
  assert.equal(
    new Set([...first.events, ...second.events].map((e) => e.eventId)).size,
    25,
  );
  assert.equal(
    (
      await json(await list(req(root + range + "&intent=execution"), ctx()))
    ).events.every((e) => e.primaryIntent === "execution"),
    true,
  );
  assert.equal(
    (
      await json(
        await list(
          req(root + range + "&clarification=true&fallback=true"),
          ctx(),
        ),
      )
    ).events.length,
    1,
  );
  const item = await json(await detail(req(root + "/event-00"), ctx()));
  assert.equal(item.reasonCode, "FUTURE_REASON");
  assert.equal(item.fallbackCode, "FUTURE_FALLBACK");
  assert.equal(item.references[0].sourceId, "deleted-source");
  assert.equal("prompt" in item.references[0], false);
  assert.equal("userId" in item, false);
  assert.equal("requestId" in item, false);
  assert.equal(JSON.stringify(item).includes("PRIVATE_FIELD"), false);
  await db.executeMultiple(`
    INSERT INTO project_ai_credentials(id,workspace_id,project_id,ciphertext,iv,auth_tag,key_id,key_fingerprint,created_by,created_at)
    VALUES ('reference-key','dash-ws','dash-p1','synthetic','synthetic','synthetic','synthetic','synthetic','dash-owner','2026-11-23T00:00:00.000Z');
    INSERT INTO project_rag_generations(id,workspace_id,project_id,status,config_version,model,dimensions,credential_id,credential_version,started_at)
    VALUES ('reference-generation','dash-ws','dash-p1','retired',1,'text-embedding-test',1,'reference-key',1,'2026-11-23T00:00:00.000Z');
    INSERT INTO project_rag_sources(id,workspace_id,project_id,generation_id,source_type,source_id,source_version,content_hash,permission_tab,title,locator_json,extraction_status)
    VALUES ('reference-source','dash-ws','dash-p1','reference-generation','artifact','dash-req','1','synthetic','requirement','Saved requirement','{}','ready');
    INSERT INTO project_rag_chunks(id,workspace_id,project_id,generation_id,source_record_id,chunk_no,section,content,content_hash,token_count,embedding,dimensions,created_at)
    VALUES ('reference-chunk','dash-ws','dash-p1','reference-generation','reference-source',0,'검색 구간 1','검색 당시 요구사항 본문','synthetic',10,X'00000000',1,'2026-11-23T00:00:00.000Z');
  `);
  const validReference = {
    sourceType: "artifact",
    sourceId: "dash-req",
    version: "1",
    chunkId: "reference-chunk",
    href: "javascript:alert(1)",
  };
  await db.execute({
    sql: "UPDATE ai_orchestration_events SET generation_id='reference-generation',source_refs_json=? WHERE id='event-00'",
    args: [
      JSON.stringify([
        { ...item.references[0], chunkId: "reference-chunk" },
        validReference,
        { ...validReference, sourceId: "dash-screen" },
        { ...validReference, sourceType: "unknown" },
        { ...validReference, version: "999" },
      ]),
    ],
  });
  const refData = await json(await referenceDetail(req(root), refContext()));
  assert.equal(refData.source.changed, true);
  assert.equal(refData.source.href, "/projects/dash-p1?tab=requirement");
  assert.ok(refData.source.content.includes("DASH-REQ"));
  assert.equal(refData.chunk.content, "검색 당시 요구사항 본문");
  assert.equal(JSON.stringify(refData).includes("ciphertext"), false);
  assert.equal(JSON.stringify(refData).includes("object_key"), false);
  assert.equal(JSON.stringify(refData).includes("javascript:"), false);
  await db.execute(
    "UPDATE ai_orchestration_events SET generation_id=NULL WHERE id='event-00'",
  );
  assert.equal(
    (await json(await referenceDetail(req(root), refContext()))).chunk,
    null,
  );
  await db.execute(
    "UPDATE ai_orchestration_events SET generation_id='reference-generation' WHERE id='event-00'",
  );
  for (const index of ["0", "3"]) {
    const missing = await json(
      await referenceDetail(req(root), refContext(index)),
    );
    assert.equal(missing.source, null);
    assert.equal(missing.chunk, null);
  }
  for (const index of ["2", "4"]) {
    assert.equal(
      (await json(await referenceDetail(req(root), refContext(index)))).chunk,
      null,
    );
  }
  await json(await referenceDetail(req(root), refContext("-1")), 400);
  await json(await referenceDetail(req(root), refContext("999999")), 404);
  await json(await referenceDetail(req(root), refContext("1", "dash-p2")), 404);
  await db.execute(
    "UPDATE project_artifacts SET deleted_at='2026-11-24T00:00:00.000Z' WHERE id='dash-req'",
  );
  const removed = await json(await referenceDetail(req(root), refContext()));
  assert.equal(removed.source, null);
  assert.equal(removed.chunk, null);
  await db.execute(
    "UPDATE project_artifacts SET deleted_at=NULL WHERE id='dash-req'",
  );
  await json(await detail(req(root + "/event-00"), ctx("dash-p2")), 404);
  assert.equal(
    (await json(await list(req(root + range), ctx("dash-p2")))).events.length,
    0,
  );
  for (const query of [
    "from=2026-02-31",
    "from=2026-11-24&to=2026-11-23",
    "intent=invalid",
    "clarification=1",
    "fallback=yes",
    "cursor=bad!",
    "cursor=" +
      Buffer.from(JSON.stringify(["bad-date", "event"])).toString("base64url"),
  ])
    await json(await list(req(root + "?" + query), ctx()), 400);
  await json(await list(req(root), ctx("dash-hidden")), 404);
  await json(await list(req(root), ctx("dash-foreign-p")), 404);
  token = "";
  await json(await list(req(root), ctx()), 401);
  token = "dash-guest-session";
  await json(await list(req(root), ctx()), 403);
  for (const role of ["admin", "member", "viewer"]) {
    await db.execute({
      sql: "UPDATE project_members SET role=? WHERE project_id='dash-p1' AND user_id='dash-viewer'",
      args: [role],
    });
    token = "dash-viewer-session";
    await json(await list(req(root), ctx()), 403);
    await json(await detail(req(root), ctx()), 403);
    await json(await referenceDetail(req(root), refContext()), 403);
  }
  token = "dash-owner-session";
  await db.execute(
    "UPDATE users SET onboarding_complete=0 WHERE id='dash-owner'",
  );
  await json(await list(req(root), ctx()), 403);
  await db.execute(
    "UPDATE users SET onboarding_complete=1 WHERE id='dash-owner'",
  );
  await db.execute(
    "UPDATE user_subscriptions SET plan_code='free' WHERE user_id='dash-owner'",
  );
  await json(await list(req(root), ctx("dash-p2")), 409);
  await db.execute(
    "UPDATE user_subscriptions SET plan_code='team' WHERE user_id='dash-owner'",
  );
  for (const [id, role] of [
    ["console-admin", "master"],
    ["console-product-admin", "team_admin"],
  ]) {
    await db.execute({
      sql: "INSERT INTO users(id,name,account_role,onboarding_complete) VALUES (?,?,?,1)",
      args: [id, id, role],
    });
    await db.execute({
      sql: "UPDATE user_subscriptions SET plan_code='team' WHERE user_id=?",
      args: [id],
    });
    await db.execute({
      sql: "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('dash-ws',?,'admin')",
      args: [id],
    });
    await db.execute({
      sql: "INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES (?,'dash-ws',?,?,?)",
      args: [id + "-entry", id + " entry", id, id],
    });
    await db.execute({
      sql: "INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES (?,'dash-ws',?,'admin')",
      args: [id + "-entry", id],
    });
    await db.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,'dash-ws',?,?)",
      args: [
        id,
        createHash("sha256")
          .update(id + "-session")
          .digest("hex"),
        id,
        new Date().toISOString(),
        new Date(Date.now() + 86400000).toISOString(),
      ],
    });
  }
  await db.executeMultiple(
    "INSERT INTO plan_products(id,product_code,name,plan_code,created_by) VALUES ('console-product','console-product','Console Test','team','console-admin'); INSERT INTO contracts(id,product_id,starts_at,created_by) VALUES ('console-contract','console-product','2026-01-01','console-admin'); INSERT INTO product_members(product_id,user_id,role,granted_by) VALUES ('console-product','console-product-admin','admin','console-admin'); INSERT INTO product_members(product_id,user_id,role,granted_by) SELECT 'console-product',id,'member','console-admin' FROM users WHERE id IN ('console-admin','dash-owner','dash-viewer','dash-outsider','dash-guest'); UPDATE workspaces SET product_id='console-product' WHERE id='dash-ws'; UPDATE user_subscriptions SET product_id='console-product' WHERE user_id IN ('console-admin','console-product-admin','dash-owner','dash-viewer','dash-outsider','dash-guest');",
  );
  await db.execute(
    "INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('console-admin-entry','dash-ws','console-product-admin','admin')",
  );
  await db.execute(
    "INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('dash-p1','dash-ws','console-admin','admin')",
  );
  const cap = handler("admin/ai-console-access");
  token = "console-admin-session";
  const base = "/api/admin/ai-console-access?workspaceId=dash-ws";
  const candidates = await json(await cap(req(base)));
  assert.equal(candidates.canOpen, false);
  await json(await cap(req(base + "&entryProjectId=dash-p1")), 403);
  assert.deepEqual(
    candidates.projects.map((p) => p.id),
    ["console-admin-entry"],
  );
  const entry = "&entryProjectId=console-admin-entry";
  assert.equal((await json(await cap(req(base + entry)))).canOpen, true);
  token = "dash-owner-session";
  await json(await cap(req(base + "&entryProjectId=dash-p1")), 403);
  token = "console-product-admin-session";
  await json(await cap(req(base + entry)), 403);
  await json(
    await cap(req(base.replace("dash-ws", "dash-foreign") + entry)),
    404,
  );
  const endpoints = [
    ["admin/ai-guardrail-approvals", "GET"],
    ["admin/ai-guardrail-approvals/count", "GET"],
    ["admin/ai-guardrail-approvals/[id]", "GET"],
    ["admin/ai-guardrail-approvals/[id]/decision", "POST"],
    ["admin/ai-guardrail-control-tower/overview", "GET"],
  ];
  for (const [path, method] of endpoints) {
    const fn = handler(path, method),
      data =
        method === "POST"
          ? {
              decision: "approve",
              expectedVersion: 1,
              comment: "Synthetic review",
            }
          : undefined;
    token = "console-admin-session";
    await json(
      await fn(req("/api/" + path + "?workspaceId=dash-ws", data), ctx()),
      400,
    );
    token = "console-product-admin-session";
    await json(
      await fn(
        req("/api/" + path + "?workspaceId=dash-ws" + entry, data),
        ctx(),
      ),
      403,
    );
    token = "console-admin-session";
    await json(
      await fn(
        req("/api/" + path + "?workspaceId=dash-ws" + entry, data),
        ctx(),
      ),
      path.includes("[id]") ? 404 : 200,
    );
    const superFn = handler(path.replace("admin/", "super-admin/"), method);
    await json(
      await superFn(
        req(
          "/api/" +
            path.replace("admin/", "super-admin/") +
            "?workspaceId=dash-ws" +
            entry,
          data,
        ),
        ctx(),
      ),
      path.includes("[id]") ? 404 : 200,
    );
  }
  token = "console-admin-session";
  const actor = await load(
    resolve("lib/guardrail-admin-access.ts"),
  ).guardrailConsoleUser(req(base + entry));
  await db.execute(
    "UPDATE product_members SET status='revoked' WHERE user_id='console-admin' AND product_id='console-product'",
  );
  const { decideApproval } = load(resolve("lib/ai/guardrail-approvals.ts"));
  await assert.rejects(
    () => decideApproval(actor, "missing", "approve", 1, "Review"),
    (e) => e.status === 403,
  );
  await db.execute(
    "UPDATE product_members SET status='active' WHERE user_id='console-admin' AND product_id='console-product'",
  );
  const plan = await db.execute(
    "EXPLAIN QUERY PLAN SELECT id FROM ai_orchestration_events WHERE workspace_id='dash-ws' AND project_id='dash-p1' ORDER BY created_at DESC,id DESC LIMIT 21",
  );
  assert.ok(JSON.stringify(plan.rows).includes("idx_orchestration_time"));
  assert.equal((await db.execute("PRAGMA foreign_key_check")).rows.length, 0);
  if (process.argv.includes("--browser")) {
    const { intentClassificationsBrowser } = await import(
      "./intent-classifications-browser.mjs"
    );
    await intentClassificationsBrowser(fixture);
  }
  console.log(
    "intent classifications: real API scope/owner checks, KST filters, tied cursor pagination, minimal metadata, admin+owner capabilities, all admin/super routes and transaction revocation passed; DB schema unchanged",
  );
} finally {
  db.close();
}
