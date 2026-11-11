import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@libsql/client";
import ts from "typescript";
import { checkProjectTemplates } from "./planning-project-template-checks.mjs";
const directory = await mkdtemp(join(tmpdir(), "matrix-planning-"));
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
  if (file.endsWith(".json")) return JSON.parse(readFileSync(file, "utf8"));
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
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
process.env.OPENAI_API_KEY = "synthetic-planning";
process.env.OPENAI_MODELS = "test-model";
let aiCalls = 0,
  aiInvalid = false,
  afterGenerate;
try {
  for (const name of (await readdir("db/migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await client.executeMultiple(
      await readFile(join("db/migrations", name), "utf8"),
    );
  await client.execute("PRAGMA foreign_keys=ON");
  await client.executeMultiple(`INSERT INTO users(id,name,account_role,onboarding_complete) VALUES ('owner','Owner','user',1),('reader','Reader','user',1),('member','Member','user',1),('outsider','Outside','user',1);
 INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Workspace','owner'),('other','Other','outsider');
 INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('ws','reader','viewer'),('ws','member','member'),('other','outsider','owner');
 INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('project','ws','Project','owner','owner');
 INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('project','ws','owner','admin'),('project','ws','reader','viewer'),('project','ws','member','member');
 UPDATE user_subscriptions SET plan_code='business'; UPDATE workspaces SET plan='business',subscription_plan='business'; UPDATE admin_setting SET value_json='true' WHERE setting_key='DB_LOGGING_ENABLED';
 INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES ('screen','ws','project','screen','SCR-001','Screen','초안','{"definition":"screen","details":"details","url":"/keep"}','{}',1,'owner','owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),('second','ws','project','screen','SCR-002','Second','초안','{"definition":"screen","details":"details"}','{}',1,'owner','owner',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);`);
  for (const [id, ws] of [
    ["owner", "ws"],
    ["reader", "ws"],
    ["member", "ws"],
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
  const { handle } = load(
    resolve("app/(editor)/planning-board/lib/server/handler.ts"),
  );
  const { createAiDocument, createEditorState } = load(
    resolve("app/(editor)/planning-board/lib/document-codec.ts"),
  );
  const { validateDocument } = load(
    resolve("app/(editor)/planning-board/lib/server/document-validation.ts"),
  );
  const { resizeRect, moveTargets } = load(
    resolve("app/(editor)/planning-board/lib/canvas-geometry.ts"),
  );
  const { movableSelection } = load(
    resolve("app/(editor)/planning-board/lib/editor-selection.ts"),
  );
  const { emojiCategories } = load(
    resolve("app/(editor)/planning-board/data/emoji-presets.ts"),
  );
  const geometry = { x: 20, y: 30, width: 100, height: 80 };
  assert.deepEqual(
    resizeRect(geometry, "w", -10, 99, { width: 500, height: 500 }),
    { x: 10, y: 30, width: 110, height: 80 },
  );
  assert.deepEqual(
    resizeRect(geometry, "n", 99, -10, { width: 500, height: 500 }),
    { x: 20, y: 20, width: 100, height: 90 },
  );
  assert.deepEqual(
    resizeRect(geometry, "e", 1000, 99, { width: 200, height: 200 }),
    { x: 20, y: 30, width: 180, height: 80 },
  );
  assert.deepEqual(
    resizeRect(geometry, "s", 99, -1000, { width: 200, height: 200 }),
    { x: 20, y: 30, width: 100, height: 18 },
  );
  const moved = moveTargets(
    [
      { id: "a", ...geometry, maxX: 200, maxY: 200 },
      { id: "b", ...geometry, x: 190, maxX: 200, maxY: 200 },
    ],
    50,
    0,
  );
  assert.equal(moved.a.x, 30);
  assert.equal(moved.b.x, 200, "group movement clamps a common delta");
  assert.deepEqual(
    movableSelection(
      [
        {
          id: "parent",
          name: "Parent",
          kind: "layer",
          children: [{ id: "child", name: "Child", kind: "text" }],
        },
        {
          id: "locked",
          name: "Locked",
          kind: "layer",
          locked: true,
          children: [
            { id: "locked-child", name: "Locked child", kind: "text" },
          ],
        },
      ],
      ["parent", "child", "locked-child"],
    ),
    ["parent"],
  );
  assert.deepEqual(
    emojiCategories[0].items.map((item) => item.text),
    Array.from({ length: 30 }, (_, i) => String(i + 1)),
  );
  for (const name of ["service-dashboard", "mobile-booking", "admin-page"]) {
    const template = JSON.parse(
      await readFile(
        `app/(editor)/planning-board/data/templates/${name}.json`,
        "utf8",
      ),
    );
    const state = createEditorState(template, {});
    validateDocument({
      schemaVersion: 1,
      title: template.title,
      activePageId: template.activePageId,
      layers: state.layers,
      sizes: state.sizes,
      positions: state.positions,
      layerText: state.text,
      layerImages: state.images,
      layerStyles: state.styles,
    });
  }
  const api = async (resource, method = "GET", input, screen = "screen") =>
    handle(
      new Request(
        `http://localhost:3000/api/planning/projects/project/screens/${screen}/${resource}`,
        {
          method,
          headers: {
            origin: process.env.APP_URL,
            "Content-Type": "application/json",
          },
          ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        },
      ),
      ["projects", "project", "screens", screen, ...resource.split("/")],
    );
  const ok = async (response) => {
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  let read = await ok(await api("board"));
  assert.equal(read.board, null);
  assert.equal(read.version, 0);
  assert.equal(
    Number(
      (await client.execute("SELECT count(*) n FROM planning_boards")).rows[0]
        .n,
    ),
    0,
    "GET does not create",
  );
  const doc = {
    schemaVersion: 1,
    title: "Board",
    activePageId: "page",
    layers: [
      {
        id: "page",
        name: "Page",
        kind: "page",
        children: [
          {
            id: "text",
            name: "Text",
            kind: "image",
            visible: false,
            locked: true,
          },
        ],
      },
    ],
    sizes: {
      page: { width: 390, height: 560 },
      text: { width: 100, height: 30 },
    },
    positions: { text: { x: 20, y: 25 } },
    layerText: { text: "Preserve" },
    layerImages: {},
    layerStyles: { text: { color: "#123456", opacity: 0.5 } },
  };
  const saveInput = () => ({
    ...doc,
    expectedVersion: read.version,
    expectedScreenVersion: read.screenVersion,
  });
  const first = saveInput();
  let result = await ok(await api("board", "POST", first));
  read = await ok(await api("board"));
  assert.equal(read.version, 1);
  assert.equal(read.screenVersion, 2);
  assert.equal(read.board.layerText.text, "Preserve");
  const screen = (
    await client.execute("SELECT * FROM project_artifacts WHERE id='screen'")
  ).rows[0];
  assert.equal(JSON.parse(screen.fields_json).url, "/keep");
  assert.equal(JSON.parse(screen.structure_json).planningBoard.id, result.id);
  assert.equal(
    (await api("board", "POST", first)).status,
    409,
    "concurrent first save",
  );
  let bad = structuredClone(saveInput());
  bad.layers[0].children.push({ ...bad.layers[0].children[0] });
  assert.equal((await api("board", "PUT", bad)).status, 400, "duplicate IDs");
  bad = structuredClone(saveInput());
  bad.positions.text.x = "bad";
  assert.equal((await api("board", "PUT", bad)).status, 400, "coordinate type");
  token = "reader-token";
  assert.equal((await api("board", "PUT", saveInput())).status, 403);
  assert.equal(
    (await api("comments", "POST", { text: "blocked" })).status,
    403,
  );
  await ok(await api("board"));
  token = "outsider-token";
  assert.equal((await api("board")).status, 404);
  token = "";
  assert.equal((await api("board")).status, 401);
  token = "owner-token";
  await ok(await api("comments", "POST", { text: "Comment" }));
  assert.equal((await ok(await api("comments"))).comments.length, 1);
  assert.equal((await ok(await api("board"))).screenVersion, 2);
  let memo = (await ok(await api("memos", "POST", { text: "Memo" }))).memo;
  memo = (
    await ok(
      await api("memos", "PATCH", {
        id: memo.id,
        version: memo.version,
        x: 50,
      }),
    )
  ).memo;
  assert.equal(memo.version, 2);
  assert.equal(
    (await api("memos", "PATCH", { id: memo.id, version: 1, x: 0 })).status,
    409,
  );
  await ok(
    await api("memos", "DELETE", { id: memo.id, version: memo.version }),
  );
  assert.equal((await ok(await api("memos"))).memos.length, 0);
  const sharp = (await import("sharp")).default;
  const binary = await sharp({
    create: { width: 2, height: 2, channels: 4, background: "#fff" },
  })
    .png()
    .toBuffer();
  const upload = () =>
    handle(
      new Request(
        "http://localhost:3000/api/planning/projects/project/screens/screen/assets",
        {
          method: "POST",
          headers: { origin: process.env.APP_URL },
          body: binary,
        },
      ),
      ["projects", "project", "screens", "screen", "assets"],
    );
  const asset = await ok(await upload());
  assert.ok(asset.url.startsWith("/api/planning/projects/"));
  doc.layerImages.text = asset.url;
  await ok(await api("board", "PUT", saveInput()));
  read = await ok(await api("board"));
  const accessResult = await ok(await api("access"));
  assert.equal(accessResult.user.id, "owner");
  assert.equal(typeof accessResult.aiEnabled, "boolean");
  assert.equal(Object.hasOwn(accessResult.user, "aiEnabled"), false);
  const legacyUrl = asset.url.replace("/api/planning/", "/planning-board/api/");
  await client.execute({
    sql: "UPDATE planning_boards SET document_json=replace(document_json,?,?) WHERE screen_artifact_id='screen'",
    args: [asset.url, legacyUrl],
  });
  await client.execute({
    sql: "INSERT INTO planning_board_revisions(id,board_id,workspace_id,project_id,screen_artifact_id,content_version,snapshot_json,actor_id,created_at) SELECT ?,board_id,workspace_id,project_id,screen_artifact_id,content_version,replace(snapshot_json,?,?),actor_id,created_at FROM planning_board_revisions WHERE screen_artifact_id='screen' AND instr(snapshot_json,?)>0 LIMIT 1",
    args: ["legacy-url-fixture", asset.url, legacyUrl, asset.url],
  });
  const storedBefore = JSON.stringify(
    (
      await client.execute(
        "SELECT document_json,version,content_version,updated_at FROM planning_boards WHERE screen_artifact_id='screen'",
      )
    ).rows,
  );
  const historyBefore = JSON.stringify(
    (
      await client.execute(
        "SELECT id,snapshot_json FROM planning_board_revisions ORDER BY id",
      )
    ).rows,
  );
  read = await ok(await api("board"));
  assert.equal(read.board.layerImages.text, asset.url);
  const legacyRevisions = await ok(await api("revisions"));
  assert.ok(
    legacyRevisions.revisions.some(
      (r) =>
        r.id === "legacy-url-fixture" &&
        r.document.layerImages.text === asset.url,
    ),
  );
  assert.equal(
    JSON.stringify(
      (
        await client.execute(
          "SELECT document_json,version,content_version,updated_at FROM planning_boards WHERE screen_artifact_id='screen'",
        )
      ).rows,
    ),
    storedBefore,
    "read normalization must not write the board",
  );
  assert.equal(
    JSON.stringify(
      (
        await client.execute(
          "SELECT id,snapshot_json FROM planning_board_revisions ORDER BY id",
        )
      ).rows,
    ),
    historyBefore,
    "read normalization must not rewrite history",
  );
  for (const invalid of [
    asset.url + "?other=1",
    asset.url + "/extra",
    "https://example.com" + asset.url,
    asset.url.replace("/assets/", "/assets/%2F"),
    asset.url.replace("/assets/", "/assets/%ZZ"),
    asset.url.replace("/assets/", "/assets/../"),
    asset.url.replace("/screens/screen/", "/screens/second/"),
    legacyUrl.replace("/projects/project/", "/projects/other/"),
  ]) {
    const invalidInput = structuredClone(saveInput());
    invalidInput.layerImages.text = invalid;
    assert.equal(
      (await api("board", "PUT", invalidInput)).status,
      400,
      invalid,
    );
  }
  doc.layerImages.text = legacyUrl;
  await ok(await api("board", "PUT", saveInput()));
  read = await ok(await api("board"));
  assert.equal(
    read.board.layerImages.text,
    asset.url,
    "legacy input saves a canonical URL",
  );
  assert.equal(
    JSON.parse(
      (
        await client.execute(
          "SELECT document_json FROM planning_boards WHERE screen_artifact_id='screen'",
        )
      ).rows[0].document_json,
    ).layerImages.text,
    asset.url,
  );
  doc.layerImages.text = asset.url;
  assert.equal((await api(`assets/${asset.id}/content`)).status, 200);
  assert.equal(
    (await api(`assets/${asset.id}/content`, "GET", undefined, "second"))
      .status,
    404,
  );
  const requestReview = () =>
    api("review", "POST", {
      action: "request",
      reviewerEmail: "member",
      message: "Review",
      expectedVersion: read.version,
      expectedScreenVersion: read.screenVersion,
    });
  let reviewed = await ok(await requestReview());
  assert.equal(reviewed.status, "review");
  read = await ok(await api("board"));
  assert.equal((await api("board", "PUT", saveInput())).status, 409);
  assert.equal(
    (await requestReview()).status,
    409,
    "duplicate review request blocked",
  );
  await client.execute(
    "UPDATE project_members SET role='member' WHERE user_id='reader'",
  );
  await ok(
    await api("review", "POST", {
      action: "request",
      reassign: true,
      reviewerEmail: "reader",
      message: "Reassign reviewer",
      expectedVersion: read.version,
      expectedScreenVersion: read.screenVersion,
    }),
  );
  read = await ok(await api("board"));
  token = "member-token";
  assert.equal(
    (
      await api("review", "POST", {
        action: "complete",
        message: "Old reviewer",
        expectedVersion: read.version,
        expectedScreenVersion: read.screenVersion,
      })
    ).status,
    403,
  );
  token = "owner-token";
  await ok(
    await api("review", "POST", {
      action: "request",
      reassign: true,
      reviewerEmail: "member",
      message: "Reassign back",
      expectedVersion: read.version,
      expectedScreenVersion: read.screenVersion,
    }),
  );
  await client.execute(
    "UPDATE project_members SET role='viewer' WHERE user_id='reader'",
  );
  read = await ok(await api("board"));
  token = "member-token";
  reviewed = await ok(
    await api("review", "POST", {
      action: "reject",
      message: "Fix",
      expectedVersion: read.version,
      expectedScreenVersion: read.screenVersion,
    }),
  );
  assert.equal(reviewed.status, "rejected");
  token = "owner-token";
  read = await ok(await api("board"));
  await ok(await api("board", "PUT", saveInput()));
  read = await ok(await api("board"));
  await ok(await requestReview());
  read = await ok(await api("board"));
  await ok(
    await api("comments", "POST", {
      text: "Review discussion remains available",
    }),
  );
  token = "member-token";
  await ok(
    await api("review", "POST", {
      action: "complete",
      message: "Approved",
      expectedVersion: read.version,
      expectedScreenVersion: read.screenVersion,
    }),
  );
  token = "owner-token";
  read = await ok(await api("board"));
  assert.equal(read.project.status, "complete");
  const { projectData } = load(resolve("lib/artifacts.ts"));
  const completedList = await projectData(client, accessResult.user, "project");
  assert.equal(
    completedList.artifacts.find((item) => item.id === "screen")
      .planningBoardStatus,
    "complete",
    "project list uses actual completed planning board status",
  );
  assert.equal(
    completedList.artifacts.find((item) => item.id === "second")
      .planningBoardStatus,
    undefined,
    "screen without board has no completed status",
  );
  assert.equal(read.project.review.message, "Approved");
  await ok(await api("board", "PUT", saveInput()));
  read = await ok(await api("board"));
  assert.equal(read.project.status, "draft");
  const editedList = await projectData(client, accessResult.user, "project");
  assert.equal(
    editedList.artifacts.find((item) => item.id === "screen")
      .planningBoardStatus,
    "draft",
    "resaving completed board disables completed preview state",
  );
  const generated = createAiDocument(
    doc.title,
    doc.layers,
    doc.sizes,
    doc.positions,
    doc.layerText,
    doc.layerStyles,
    "page",
  );
  assert.equal(generated.pages[0].width, 390);
  const restored = createEditorState(generated, doc.layerImages);
  assert.equal(restored.layers[0].children[0].locked, true);
  assert.equal(restored.images.text, asset.url);
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    aiCalls++;
    const body = JSON.parse(options.body);
    assert.equal(body.max_output_tokens, 16000);
    if (afterGenerate) await afterGenerate();
    return Response.json({
      id: `planning-${aiCalls}`,
      status: "completed",
      model: "test-model",
      usage: { input_tokens: 20, output_tokens: 50, total_tokens: 70 },
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: aiInvalid ? "{}" : JSON.stringify(generated),
            },
          ],
        },
      ],
    });
  };
  const aiInput = () => ({
    requestId: randomUUID(),
    model: "test-model",
    prompt: "Keep the board",
    currentDocument: generated,
    editorDocument: doc,
    expectedVersion: read.version,
    expectedScreenVersion: read.screenVersion,
  });
  const ai = aiInput();
  result = await ok(await api("ai/generate", "POST", ai));
  assert.equal(result.saved, true);
  assert.equal(aiCalls, 1);
  await ok(await api("ai/generate", "POST", ai));
  assert.equal(aiCalls, 1, "idempotent replay does not charge again");
  assert.equal(
    (await api("ai/generate", "POST", { ...ai, prompt: "changed" })).status,
    409,
  );
  read = await ok(await api("board"));
  const beforeFailure = read.version;
  aiInvalid = true;
  assert.equal((await api("ai/generate", "POST", aiInput())).status, 502);
  assert.equal((await ok(await api("board"))).version, beforeFailure);
  aiInvalid = false;
  afterGenerate = async () => {
    await api("board", "PUT", saveInput());
  };
  assert.equal(
    (await api("ai/generate", "POST", aiInput())).status,
    409,
    "AI save conflict preserves latest board",
  );
  afterGenerate = undefined;
  read = await ok(await api("board"));
  const history = await ok(await api("ai/history"));
  assert.equal(history.chats.length, 3);
  token = "member-token";
  assert.equal(
    (await ok(await api("ai/history"))).chats.length,
    0,
    "AI history owner scoping",
  );
  token = "owner-token";
  const beforeBlocked = aiCalls;
  assert.equal(
    (
      await api("ai/generate", "POST", {
        ...aiInput(),
        prompt: "-----BEGIN PRIVATE KEY-----",
      })
    ).status,
    422,
    "Matrix guardrails apply to planning AI",
  );
  assert.equal(aiCalls, beforeBlocked);
  const guardPolicy = {
    ...load(resolve("lib/ai/guardrail-types.ts")).defaultGuardrailPolicy,
    maxChanges: 0,
  };
  await client.execute({
    sql: "INSERT INTO ai_guardrail_policies(workspace_id,version,config_json,published_by,published_at) VALUES (?,1,?,?,?)",
    args: [
      "ws",
      JSON.stringify(guardPolicy),
      "owner",
      new Date().toISOString(),
    ],
  });
  await client.execute({
    sql: "INSERT INTO ai_guardrail_configs(workspace_id,active_version,draft_json,updated_by,updated_at) VALUES (?,1,?,?,?)",
    args: [
      "ws",
      JSON.stringify(guardPolicy),
      "owner",
      new Date().toISOString(),
    ],
  });
  assert.equal(
    (await api("ai/generate", "POST", aiInput())).status,
    422,
    "maxChanges=0 blocks before the paid call",
  );
  assert.equal(aiCalls, beforeBlocked);
  await client.execute(
    "UPDATE ai_guardrail_configs SET active_version=NULL WHERE workspace_id='ws'",
  );
  const formatted = await ok(
    await api("format-code", "POST", {
      markup: "<main>Hello</main>",
      reactMarkup: "<main>Hello</main>",
      css: "main {color:red;}",
    }),
  );
  for (const target of ["css", "html5", "react", "astro", "svelte"])
    assert.equal(typeof formatted.codes[target], "string");
  const revisions = await ok(await api("revisions"));
  assert.ok(revisions.revisions.length >= 4);
  const revision = revisions.revisions[0];
  await assert.rejects(
    () =>
      client.execute({
        sql: "DELETE FROM planning_board_revisions WHERE id=?",
        args: [revision.id],
      }),
    /Immutable/,
  );
  const artifactService = load(resolve("lib/artifacts.ts")),
    user = await load(resolve("lib/auth.ts")).requireUser();
  const before = (
    await client.execute("SELECT * FROM project_artifacts WHERE id='screen'")
  ).rows[0];
  await artifactService.mutateArtifact(
    new Request("http://localhost:3000"),
    user,
    "project",
    {
      version: Number(before.version),
      title: "Screen edited",
      status: "초안",
      fields: JSON.parse(before.fields_json),
      links: [],
    },
    "UPDATE",
    "screen",
  );
  assert.ok(
    JSON.parse(
      (
        await client.execute(
          "SELECT structure_json FROM project_artifacts WHERE id='screen'",
        )
      ).rows[0].structure_json,
    ).planningBoard,
    "normal screen updates preserve board reference",
  );
  const featureDocument = {
    schemaVersion: 1,
    title: "Text and badges",
    activePageId: "page",
    layers: [
      {
        id: "page",
        name: "Page",
        kind: "page",
        children: [
          { id: "multiline", name: "Multiline", kind: "text" },
          {
            id: "multi-select",
            name: "Select",
            kind: "select",
            selectMode: "multi",
            optionItems: [
              { display: "Option 1", value: "one" },
              { display: "선택 2", value: "two" },
            ],
          },
          ...emojiCategories[0].items.map((item, i) => ({
            id: `badge-${i + 1}`,
            name: item.label,
            kind: "text",
          })),
        ],
      },
    ],
    sizes: {
      page: { width: 860, height: 560 },
      multiline: { width: 180, height: 120 },
    },
    positions: { multiline: { x: 10, y: 20 } },
    layerText: { multiline: "First\n\nThird  😀" },
    layerImages: {},
    layerStyles: {
      multiline: {
        textAlign: "right",
        verticalAlign: "bottom",
        backgroundColor: "#123456",
      },
    },
  };
  for (const [index, item] of emojiCategories[0].items.entries()) {
    const id = `badge-${index + 1}`;
    featureDocument.sizes[id] = { width: 32, height: 32 };
    featureDocument.positions[id] = {
      x: (index % 10) * 40,
      y: 160 + Math.floor(index / 10) * 40,
    };
    featureDocument.layerText[id] = item.text;
    featureDocument.layerStyles[id] = item.style;
  }
  const converted = createEditorState(
    createAiDocument(
      featureDocument.title,
      featureDocument.layers,
      featureDocument.sizes,
      featureDocument.positions,
      featureDocument.layerText,
      featureDocument.layerStyles,
      "multiline",
    ),
    {},
  );
  assert.equal(converted.styles.multiline.verticalAlign, "bottom");
  const { capturePixels, previewCapture } = load(
    resolve("app/(editor)/planning-board/lib/preview-capture.ts"),
  );
  assert.deepEqual(
    capturePixels({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 860, 560),
    { x: 215, y: 140, width: 430, height: 280 },
  );
  assert.deepEqual(
    capturePixels({ x: -0.25, y: 0.9, width: 0.5, height: 0.5 }, 100, 100),
    { x: 0, y: 90, width: 25, height: 10 },
  );
  await assert.rejects(previewCapture({ offsetWidth: 0, offsetHeight: 100 }));
  await assert.rejects(
    previewCapture({ offsetWidth: 20000, offsetHeight: 100 }),
  );
  const convertedSelect = converted.layers[0].children.find(
    (item) => item.id === "multi-select",
  );
  assert.equal(convertedSelect.selectMode, "multi");
  assert.deepEqual(
    convertedSelect.optionItems,
    featureDocument.layers[0].children.find(
      (item) => item.id === "multi-select",
    ).optionItems,
  );
  const invalidSelect = structuredClone(featureDocument);
  invalidSelect.layers[0].children.find(
    (item) => item.id === "multi-select",
  ).selectMode = "invalid";
  assert.throws(() => validateDocument(invalidSelect));
  const legacySelect = structuredClone(featureDocument);
  delete legacySelect.layers[0].children.find(
    (item) => item.id === "multi-select",
  ).selectMode;
  validateDocument(legacySelect);
  assert.equal(converted.text.multiline, featureDocument.layerText.multiline);
  const oldStyle = structuredClone(featureDocument);
  delete oldStyle.layerStyles.multiline.verticalAlign;
  validateDocument(oldStyle);
  const invalidAlignment = structuredClone(featureDocument);
  invalidAlignment.layerStyles.multiline.verticalAlign = "invalid";
  assert.throws(() => validateDocument(invalidAlignment));
  const secondRead = await ok(await api("board", "GET", undefined, "second"));
  await ok(
    await api(
      "board",
      "PUT",
      {
        document: featureDocument,
        expectedVersion: secondRead.version,
        expectedScreenVersion: secondRead.screenVersion,
      },
      "second",
    ),
  );
  const persisted = (await ok(await api("board", "GET", undefined, "second")))
    .board;
  assert.deepEqual(persisted.layerText, featureDocument.layerText);
  assert.deepEqual(
    persisted.layers[0].children.find((item) => item.id === "multi-select"),
    featureDocument.layers[0].children.find(
      (item) => item.id === "multi-select",
    ),
  );
  assert.deepEqual(persisted.layerStyles, featureDocument.layerStyles);
  const secondRevision = JSON.parse(
    (
      await client.execute(
        "SELECT snapshot_json FROM planning_board_revisions WHERE screen_artifact_id='second' ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0].snapshot_json,
  );
  assert.equal(secondRevision.layerStyles.multiline.verticalAlign, "bottom");
  await checkProjectTemplates({
    client,
    handle,
    binary,
    load,
    resolve,
    setToken: (value) => {
      token = value;
    },
    setStorageFailure: (value) => {
      failStorage = value;
    },
    setOnPut: (value) => {
      onPut = value;
    },
  });
  await client.execute(
    "UPDATE project_artifacts SET deleted_at=CURRENT_TIMESTAMP WHERE id='screen'",
  );
  assert.equal((await api("board")).status, 404);
  assert.equal((await api(`assets/${asset.id}/content`)).status, 404);
  console.log(
    "PASS planning board: SQLite migration, scoped access, separate User/AI contract, legacy image read/input normalization and immutable history, malformed/cross-scope asset rejection, optimistic saves, screen references, collaboration, review, assets, AI atomicity/idempotence, codecs, 5 export formats",
  );
} finally {
  globalThis.fetch = originalFetch;
  client.close();
}
