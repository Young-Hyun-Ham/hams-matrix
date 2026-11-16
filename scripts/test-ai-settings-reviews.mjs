import { spawnSync } from "node:child_process";
// Real route handlers and database; replace only Next request cookies and the external S3 service.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import ts from "typescript";

const directory = await mkdtemp(join(tmpdir(), "matrix-ai-reviews-"));
process.env.TURSO_DATABASE_URL = pathToFileURL(join(directory, "test.db")).href;
process.env.TURSO_AUTH_TOKEN = "";
process.env.APP_URL = "http://localhost:3000";
Object.assign(process.env, {
  R2_ENDPOINT: "https://test.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: "test",
  R2_SECRET_ACCESS_KEY: "test",
  R2_BUCKET_NAME: "private-test",
});
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
const require = createRequire(import.meta.url),
  cache = new Map(),
  objects = new Map();
let token = "owner-token",
  failStorage = false,
  onPut;
class PutObjectCommand {
  constructor(input) {
    this.input = input;
  }
}
class GetObjectCommand extends PutObjectCommand {}
class DeleteObjectCommand extends PutObjectCommand {}
class S3Client {
  constructor(config) {
    assert.equal(config.region, "auto");
  }
  destroy() {}
  async send(command) {
    const input = command.input;
    assert.equal(input.Bucket, "private-test");
    if (failStorage) throw new Error("StorageUnavailable");
    if (command instanceof GetObjectCommand) {
      assert.ok(objects.has(input.Key));
      return {
        Body: { transformToByteArray: async () => objects.get(input.Key) },
      };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(input.Key);
      return {};
    }
    objects.set(input.Key, input.Body);
    if (onPut) await onPut();
    return {};
  }
}
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (request) => {
      if (request === "server-only") return {};
      if (request === "next/headers")
        return {
          cookies: async () => ({
            get: () => (token ? { value: token } : undefined),
          }),
        };
      if (request === "next/server") return { connection: async () => {} };
      if (request === "@aws-sdk/client-s3")
        return {
          S3Client,
          PutObjectCommand,
          GetObjectCommand,
          DeleteObjectCommand,
        };
      if (!request.startsWith(".") && !request.startsWith("@/"))
        return require(request);
      const base = request.startsWith("@/")
        ? resolve(request.slice(2))
        : resolve(dirname(file), request);
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw new Error(`Missing module: ${base}`);
      return load(target);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const originalFetch = globalThis.fetch;
let planned = null,
  providerCalls = 0,
  titleCalls = 0;
const req = (method = "GET", data) =>
  new Request("http://localhost:3000/test", {
    method,
    headers: {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
const assertStatus = async (response, status) => {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
};
try {
  await client.execute("PRAGMA foreign_keys=ON");
  const migrations = (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort();
  for (const name of migrations.filter((n) => n < "046"))
    await client.executeMultiple(
      `BEGIN IMMEDIATE;${await readFile(join("db/migrations", name), "utf8")};COMMIT;`,
    );
  await client.executeMultiple(`INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('owner','Owner','user',1),('outsider','Other','user',1);
 INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Workspace','owner'),('other','Other','outsider');
 INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('other','outsider','owner');
 INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('project','ws','Project','owner','owner'),('second','ws','Second','owner','owner'),('hidden','other','Hidden','outsider','outsider');
 INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('project','ws','owner','admin'),('second','ws','owner','admin'),('hidden','other','outsider','admin');
 UPDATE user_subscriptions SET plan_code='business';UPDATE workspaces SET plan='business',subscription_plan='business';
 INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,is_pinned,target_page,target_version,created_at,updated_at) VALUES ('legacy','ws','owner','project','Keep title',1,'requirement',7,'old','old');
 INSERT INTO ai_prompt_chats(rowid,id,workspace_id,user_id,project_id,pathname,screen_title,prompt,model,result,conv_id) VALUES (77,'old-chat','ws','owner','project','/projects/project','Old','Original prompt','mock','Original result','legacy');`);
  const before = (await client.execute("SELECT rowid,* FROM ai_prompt_chats"))
    .rows;
  await client.execute(
    "CREATE TABLE schema_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  for (const name of migrations.filter(
    (n) => n < "046" && n !== "023_toast_colors.sql",
  ))
    await client.execute({
      sql: "INSERT INTO schema_migrations(name) VALUES (?)",
      args: [name],
    });
  for (const migration of [
    "046_ai_project_analysis_reviews.sql",
    "047_notification_acknowledgements.sql",
  ])
    for (let pass = 0; pass < 2; pass++) {
      const migrated = spawnSync(
        process.execPath,
        [resolve("scripts/migrate.mjs"), "--only", migration],
        {
          windowsHide: true,
          encoding: "utf8",
          env: {
            ...process.env,
            TURSO_DATABASE_URL: pathToFileURL(join(directory, "test.db")).href,
            TURSO_AUTH_TOKEN: "",
          },
        },
      );
      assert.equal(migrated.status, 0, migrated.stderr);
    }
  assert.equal(
    (
      await client.execute(
        "SELECT name FROM schema_migrations WHERE name='023_toast_colors.sql'",
      )
    ).rows.length,
    0,
    "unrelated pending migration is not applied",
  );
  assert.deepEqual(
    (await client.execute("SELECT rowid,* FROM ai_prompt_chats")).rows,
    before,
  );
  assert.equal(
    (
      await client.execute(
        "SELECT title_source FROM ai_conversations WHERE conv_id='legacy'",
      )
    ).rows[0].title_source,
    "legacy",
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  for (const [id, ws] of [
    ["owner", "ws"],
    ["outsider", "other"],
  ])
    await client.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
      args: [
        id,
        createHash("sha256").update(`${id}-token`).digest("hex"),
        id,
        ws,
        new Date().toISOString(),
        new Date(Date.now() + 3600000).toISOString(),
      ],
    });
  process.env.OPENAI_API_KEY = "synthetic-key";
  process.env.OPENAI_MODELS = "gpt-5.6-sol";
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    providerCalls++;
    const b = JSON.parse(options.body);
    let output;
    if (b.instructions.includes("한 줄 제목")) {
      titleCalls++;
      output = [
        {
          type: "message",
          content: [{ type: "output_text", text: "요구사항 검증 누락 분석" }],
        },
      ];
    } else if (planned && !Array.isArray(b.input)) {
      throw Error("Expected tool messages");
    } else if (
      planned &&
      !b.input.some((m) => m.type === "function_call_output")
    ) {
      output = [
        {
          type: "function_call",
          name: planned.name ?? "save_artifact",
          call_id: "command",
          arguments: JSON.stringify(planned.input),
        },
      ];
    } else
      output = [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "검증한 변경안입니다. 아직 반영되지 않았습니다.",
            },
          ],
        },
      ];
    return Response.json({
      id: `response-${providerCalls}`,
      status: "completed",
      model: "gpt-5.6-sol",
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
      output,
    });
  };
  const settings = load(resolve("app/api/me/ai-settings/route.ts"));
  const rooms = load(resolve("app/api/ai/conversations/route.ts"));
  const chats = load(resolve("app/api/ai/chats/route.ts"));
  const reviewRoute = load(resolve("app/api/ai/reviews/[reviewId]/route.ts"));
  const roomRoute = load(resolve("app/api/ai/conversations/[convId]/route.ts"));
  const projects = load(resolve("app/api/ai/projects/route.ts"));
  const countRoute = load(resolve("app/api/me/notifications/count/route.ts"));
  let result = await assertStatus(await settings.GET(), 200);
  assert.equal(result.settings.tokenLimit, 1000000);
  assert.equal(result.settings.hitlEnabled, true);
  assert.equal(
    (await client.execute("SELECT * FROM user_ai_settings")).rows.length,
    0,
  );
  for (const limit of [0, -1, 1.1, "100", Number.MAX_SAFE_INTEGER + 1])
    await assertStatus(
      await settings.PATCH(
        req("PATCH", {
          hitlEnabled: true,
          tokenLimit: limit,
          expectedVersion: 0,
        }),
      ),
      400,
    );
  await assertStatus(
    await settings.PATCH(
      req("PATCH", {
        hitlEnabled: true,
        tokenLimit: 1000000,
        expectedVersion: 0,
      }),
    ),
    200,
  );
  await assertStatus(
    await settings.PATCH(
      req("PATCH", { hitlEnabled: false, tokenLimit: 1, expectedVersion: 0 }),
    ),
    409,
  );
  const list = await assertStatus(
    await projects.GET(
      new Request("http://localhost:3000/api/ai/projects?limit=1"),
    ),
    200,
  );
  assert.equal(list.projects.length, 1);
  assert.ok(list.nextCursor);
  assert.notEqual(list.projects[0].id, "hidden");
  const makeRoom = async (target = "requirement") =>
    (
      await assertStatus(
        await rooms.POST(
          req("POST", {
            projectId: "project",
            targetPage: target,
            sourceContext: {
              pathname:
                target === "project-analysis"
                  ? "/dashboard"
                  : "/projects/project",
              tab: target === "project-analysis" ? null : target,
            },
          }),
        ),
        201,
      )
    ).conversation;
  const send = async (
    room,
    prompt = "요구사항을 등록해줘",
    source = { pathname: "/projects/project", tab: room.targetPage },
  ) =>
    chats.POST(
      req("POST", {
        requestId: crypto.randomUUID(),
        convId: room.convId,
        projectId: room.projectId,
        prompt,
        model: "gpt-5.6-sol",
        sourceContext: source,
        targetPage: room.targetPage,
        expectedTargetVersion: room.targetVersion,
      }),
    );
  const context = (id) => ({ params: Promise.resolve({ reviewId: id }) });
  const decision = (r, d = "approve") =>
    reviewRoute.POST(
      req("POST", { decision: d, hash: r.hash, expectedVersion: r.version }),
      context(r.reviewId),
    );
  planned = {
    input: {
      action: "CREATE",
      title: "요구사항 검증",
      status: "초안",
      fields: {
        category: "SFR",
        definition: "가입",
        details: "사용자 검증",
        priority: "중",
      },
    },
  };
  let room = await makeRoom();
  result = await assertStatus(await send(room), 200);
  assert.ok(result.chat.review);
  assert.equal(result.actions.length, 0);
  assert.equal(result.conversation.title, "요구사항 검증 누락 분석");
  assert.equal(result.conversation.titleSource, "auto");
  assert.equal(
    (await client.execute("SELECT * FROM project_artifacts")).rows.length,
    0,
  );
  const restored = await assertStatus(
    await chats.GET(
      new Request(
        `http://localhost:3000/api/ai/chats?projectId=project&convId=${room.convId}`,
      ),
    ),
    200,
  );
  assert.equal(restored.chats[0].review.status, "pending");
  await assertStatus(await send(result.conversation), 409);
  const approved = await assertStatus(await decision(result.chat.review), 200);
  assert.equal(approved.review.status, "applied");
  assert.equal(approved.review.actions.length, 1);
  assert.equal(
    (await client.execute("SELECT * FROM project_artifacts")).rows.length,
    1,
  );
  await assertStatus(await decision(result.chat.review), 200);
  assert.equal(
    (await client.execute("SELECT * FROM project_artifacts")).rows.length,
    1,
  );
  room = result.conversation;
  planned = null;
  let titles = titleCalls;
  result = await assertStatus(await send(room, "현재 자료를 분석해줘"), 200);
  assert.equal(titleCalls, titles);
  assert.equal(result.conversation.title, "요구사항 검증 누락 분석");
  room = await makeRoom();
  await assertStatus(
    await roomRoute.PATCH(
      req("PATCH", {
        projectId: "project",
        title: "내 제목",
        expectedTitleVersion: 0,
      }),
      { params: Promise.resolve({ convId: room.convId }) },
    ),
    200,
  );
  result = await assertStatus(await send(room, "자료를 분석해줘"), 200);
  assert.equal(result.conversation.title, "내 제목");
  assert.equal(titleCalls, titles);
  planned = {
    input: {
      action: "CREATE",
      title: "승인 대기",
      status: "초안",
      fields: {
        category: "SFR",
        definition: "검증",
        details: "검토",
        priority: "중",
      },
    },
  };
  room = await makeRoom();
  result = await assertStatus(await send(room), 200);
  token = "outsider-token";
  await assertStatus(
    await reviewRoute.GET(req(), context(result.chat.review.reviewId)),
    404,
  );
  token = "owner-token";
  await client.execute("UPDATE project_artifacts SET version=version+1");
  await assertStatus(await decision(result.chat.review), 409);
  assert.equal(
    (
      await assertStatus(
        await reviewRoute.GET(req(), context(result.chat.review.reviewId)),
        200,
      )
    ).review.status,
    "invalidated",
  );
  room = await makeRoom();
  result = await assertStatus(await send(room), 200);
  await assertStatus(await decision(result.chat.review, "reject"), 200);
  assert.equal(
    (await client.execute("SELECT * FROM project_artifacts")).rows.length,
    1,
  );
  // RFP changes use the same durable review boundary.
  const rfpDraft = load(resolve("lib/rfp-template.ts")).createEmptyRfp(
    "project",
  );
  rfpDraft.title = "검토할 제안요청서";
  planned = {
    name: "save_rfp_document",
    input: { action: "CREATE", draft: rfpDraft },
  };
  room = await makeRoom("rfp");
  result = await assertStatus(await send(room, "제안요청서를 작성해줘"), 200);
  assert.ok(result.chat.review);
  assert.equal(
    (await client.execute("SELECT * FROM project_rfp_documents")).rows.length,
    0,
  );
  await assertStatus(await decision(result.chat.review), 200);
  assert.equal(
    (await client.execute("SELECT * FROM project_rfp_documents")).rows.length,
    1,
  );
  planned = null;
  room = await makeRoom("project-analysis");
  result = await assertStatus(
    await send(room, "프로젝트를 분석해줘", {
      pathname: "/dashboard",
      tab: null,
    }),
    200,
  );
  assert.equal(result.chat.targetPage, "project-analysis");
  // Exact token boundary, unknown and duplicate do not inflate the budget.
  await client.execute("DELETE FROM ai_token_usage");
  await client.execute(
    "INSERT INTO ai_token_usage(id,workspace_id,user_id,project_name,conv_id,conversation_title,chat_id,request_id,call_index,model,prompt_characters,created_at,status,usage_known,usage_final,input_tokens,output_tokens,total_tokens) VALUES ('usage','ws','owner','','budget','','','budget',0,'mock',0,'2026-01-01','completed',1,1,999999,1,1000000)",
  );
  assert.equal(
    (await assertStatus(await countRoute.GET(), 200)).aiTokenLimitExceeded,
    false,
  );
  await client.execute(
    "UPDATE ai_token_usage SET input_tokens=1000000,total_tokens=1000001 WHERE id='usage'",
  );
  assert.equal(
    (await assertStatus(await countRoute.GET(), 200)).aiTokenLimitExceeded,
    true,
  );
  const notifications = load(resolve("app/api/me/notifications/route.ts"));
  const unreadBefore = (await assertStatus(await countRoute.GET(), 200)).unread;
  const notice = (await assertStatus(await notifications.GET(), 200)).budget;
  assert.equal(notice.readAt, null);
  result = await assertStatus(
    await notifications.PATCH(req("PATCH", { key: notice.key })),
    200,
  );
  assert.equal(result.unread, unreadBefore - 1);
  assert.ok(result.budget.readAt);
  assert.equal(
    result.budget.exceeded,
    true,
    "read card remains visible while exceeded",
  );
  const readAt = result.budget.readAt;
  result = await assertStatus(
    await notifications.PATCH(req("PATCH", { key: notice.key })),
    200,
  );
  assert.equal(result.unread, unreadBefore - 1, "repeat click is idempotent");
  assert.equal(result.budget.readAt, readAt);
  assert.equal(
    (await assertStatus(await countRoute.GET(), 200)).unread,
    unreadBefore - 1,
  );
  assert.equal(
    (await assertStatus(await notifications.GET(), 200)).budget.readAt,
    readAt,
  );
  await assertStatus(
    await notifications.PATCH(req("PATCH", { key: "team-request:foreign" })),
    404,
  );
  token = "outsider-token";
  await assertStatus(
    await notifications.PATCH(req("PATCH", { key: notice.key })),
    404,
  );
  token = "owner-token";
  const currentSettings = (await assertStatus(await settings.GET(), 200))
    .settings;
  const unchanged = (
    await assertStatus(
      await settings.PATCH(
        req("PATCH", {
          ...currentSettings,
          expectedVersion: currentSettings.version,
          version: undefined,
        }),
      ),
      200,
    )
  ).settings;
  assert.equal(
    (await assertStatus(await notifications.GET(), 200)).budget.readAt,
    readAt,
    "same limit preserves read status",
  );
  await assertStatus(
    await settings.PATCH(
      req("PATCH", {
        hitlEnabled: unchanged.hitlEnabled,
        tokenLimit: 999999,
        expectedVersion: unchanged.version,
      }),
    ),
    200,
  );
  assert.equal(
    (await assertStatus(await notifications.GET(), 200)).budget.readAt,
    null,
    "changed limit starts a new warning",
  );
  assert.equal(
    (await assertStatus(await countRoute.GET(), 200)).unread,
    unreadBefore,
  );
  const changed = (await assertStatus(await settings.GET(), 200)).settings;
  await assertStatus(
    await settings.PATCH(
      req("PATCH", {
        hitlEnabled: changed.hitlEnabled,
        tokenLimit: 1000000,
        expectedVersion: changed.version,
      }),
    ),
    200,
  );
  await client.execute(
    "UPDATE ai_token_usage SET status='duplicate' WHERE id='usage'",
  );
  assert.equal(
    (await assertStatus(await countRoute.GET(), 200)).aiTokenLimitExceeded,
    false,
  );
  // Team acknowledgement only affects the reader; handling and a new application change visibility.
  await client.execute(
    "INSERT INTO team_join_requests(id,workspace_id,user_id) VALUES ('notice-request','ws','outsider')",
  );
  const teamNotice = (
    await assertStatus(await notifications.GET(), 200)
  ).requests.find((item) =>
    item.key.startsWith("team-request:notice-request:"),
  );
  assert.ok(teamNotice);
  const teamCount = (await assertStatus(await countRoute.GET(), 200)).unread;
  result = await assertStatus(
    await notifications.PATCH(req("PATCH", { key: teamNotice.key })),
    200,
  );
  assert.equal(result.unread, teamCount - 1);
  assert.ok(result.requests.find((item) => item.key === teamNotice.key).readAt);
  await client.execute(
    "UPDATE team_join_requests SET status='rejected' WHERE id='notice-request'",
  );
  assert.equal(
    (await assertStatus(await notifications.GET(), 200)).requests.length,
    0,
  );
  await client.execute(
    "UPDATE team_join_requests SET status='pending',requested_at='2099-01-01' WHERE id='notice-request'",
  );
  assert.equal(
    (await assertStatus(await countRoute.GET(), 200)).unread,
    teamCount,
  );
  assert.equal(
    (await assertStatus(await notifications.GET(), 200)).requests[0].readAt,
    null,
  );
  await client.execute(
    "DELETE FROM team_join_requests WHERE id='notice-request'",
  );
  // Explicitly disabled HITL retains automatic commit.
  let latest = (await assertStatus(await settings.GET(), 200)).settings;
  await assertStatus(
    await settings.PATCH(
      req("PATCH", {
        hitlEnabled: false,
        tokenLimit: 1000000,
        expectedVersion: latest.version,
      }),
    ),
    200,
  );
  planned = {
    input: {
      action: "CREATE",
      title: "자동 저장",
      status: "초안",
      fields: {
        category: "SFR",
        definition: "자동",
        details: "검증",
        priority: "중",
      },
    },
  };
  room = await makeRoom();
  result = await assertStatus(await send(room), 200);
  assert.equal(result.chat.review, undefined);
  assert.equal(result.actions.length, 1);

  // Batch FK dependencies and update/delete retain the same whole-request approval boundary.
  latest = (await assertStatus(await settings.GET(), 200)).settings;
  await assertStatus(
    await settings.PATCH(
      req("PATCH", {
        hitlEnabled: true,
        tokenLimit: 1000000,
        expectedVersion: latest.version,
      }),
    ),
    200,
  );
  const table = (index) => ({
    clientRef: `t${index}`,
    title: `Reviewed table ${index}`,
    fields: {
      definition: "Synthetic table",
      physicalName: `review_table_${index}`,
      logicalName: `Table ${index}`,
    },
    structure: {
      columns: [
        {
          id: "id",
          logicalName: "identifier",
          name: "id",
          dataType: "INTEGER",
          nullable: false,
          primaryKey: true,
          unique: false,
        },
      ],
    },
  });
  const tables = [table(1), table(2)];
  tables[0].structure.columns.push({
    id: "parent",
    logicalName: "parent",
    name: "parent_id",
    dataType: "INTEGER",
    nullable: true,
    primaryKey: false,
    unique: false,
    reference: { tableId: "@t2", columnId: "id" },
  });
  planned = { name: "save_database_tables", input: { items: tables } };
  room = await makeRoom("database");
  result = await assertStatus(await send(room, "테이블들을 등록해줘"), 200);
  assert.ok(result.chat.review);
  assert.equal(
    (
      await client.execute(
        "SELECT COUNT(*) AS n FROM project_artifacts WHERE kind='database'",
      )
    ).rows[0].n,
    0,
  );
  const batch = await assertStatus(await decision(result.chat.review), 200);
  assert.equal(batch.review.actions.length, 2);
  const first = (
    await client.execute(
      "SELECT id,version FROM project_artifacts WHERE kind='requirement' ORDER BY id LIMIT 1",
    )
  ).rows[0];
  planned = {
    input: {
      action: "UPDATE",
      id: first.id,
      version: first.version,
      title: "Reviewed update",
    },
  };
  room = await makeRoom();
  result = await assertStatus(
    await send(room, `${first.id} 요구사항을 수정해줘`),
    200,
  );
  assert.ok(result.chat.review);
  await assertStatus(await decision(result.chat.review), 200);
  const updated = (
    await client.execute({
      sql: "SELECT title,version FROM project_artifacts WHERE id=?",
      args: [first.id],
    })
  ).rows[0];
  assert.equal(updated.title, "Reviewed update");
  planned = {
    input: { action: "DELETE", id: first.id, version: updated.version },
  };
  room = await makeRoom();
  result = await assertStatus(
    await send(room, "Reviewed update 요구사항을 삭제해줘"),
    200,
  );
  assert.ok(result.chat.review);
  await assertStatus(await decision(result.chat.review, "reject"), 200);
  assert.equal(
    (
      await client.execute({
        sql: "SELECT deleted_at FROM project_artifacts WHERE id=?",
        args: [first.id],
      })
    ).rows[0].deleted_at,
    null,
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    "PASS: migration preservation, settings/version/scope, projects, first title/manual title, durable artifact/RFP reviews, idempotent approval/rejection/stale sources, analysis, budget boundary, durable notification acknowledgement/count/idempotency/scope/lifecycle, automatic mode.",
  );
} finally {
  globalThis.fetch = originalFetch;
  await load(resolve("lib/db.ts")).db().close();
  client.close();
}
