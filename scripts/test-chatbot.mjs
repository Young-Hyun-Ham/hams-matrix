// Synthetic database, in-memory object store and mock provider only. Never loads .env.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const fixture = await dashboardFixture(),
  { db } = fixture,
  require = createRequire(import.meta.url),
  cache = new Map(),
  blobs = new Map();
process.env.AI_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 17).toString(
  "base64",
);
process.env.OPENAI_API_KEY = "synthetic-chatbot-provider-key";
process.env.CHATBOT_API_ALLOWED_HOSTS = "example.org";
for (const key of [
  "CHATBOT_OPENAI_API_KEY",
  "CHATBOT_TEXT_MODELS",
  "CHATBOT_IMAGE_MODELS",
  "OPENAI_MODELS",
  "OPENAI_IMAGE_MODELS",
  "CHATBOT_TEXT_MODEL",
  "CHATBOT_DOCUMENT_MODEL",
  "CHATBOT_IMAGE_MODEL",
])
  delete process.env[key];
let token = "dash-owner-session",
  calls = 0,
  connectorCalls = 0,
  generatedText = "모의 모델 답변",
  generatedDecision = null,
  checks = 0;
const callInputs = [],
  png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a30sAAAAASUVORK5CYII=";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.ok(String(url).startsWith("https://api.openai.com/v1/"));
  if (String(url).endsWith("/models"))
    return Response.json({
      data: [{ id: "gpt-chatbot-test" }, { id: "gpt-image-chatbot-test" }],
    });
  calls++;
  callInputs.push(init?.body);
  if (String(url).includes("/images/"))
    return Response.json({ data: [{ b64_json: png }] });
  const structured =
    typeof init?.body === "string" &&
    JSON.parse(init.body).text?.format?.name === "chatbot_decision";
  const text = structured
    ? JSON.stringify(
        generatedDecision ?? {
          kind: "answer",
          text: generatedText,
          intent: "general",
          field: "",
          title: "",
          options: [],
          allowCustom: false,
        },
      )
    : generatedText;
  return Response.json({
    output: [{ content: [{ type: "output_text", text }] }],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  });
};
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => db };
  if (file === resolve("lib/r2.ts"))
    return {
      putDocument: async (key, value) => blobs.set(key, Buffer.from(value)),
      getDocument: async (key) => {
        assert.ok(blobs.has(key));
        return blobs.get(key);
      },
      removeDocument: async (key) => blobs.delete(key),
    };
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
      const path = [base + ".ts", base + ".tsx", base].find(existsSync);
      assert.ok(path, base);
      return load(path);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const route = (path, method) =>
  load(resolve("app/api/chatbot/" + path + "/route.ts"))[method];
function req(path, method = "GET", data, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/chatbot/" + path, {
    method,
    headers: { origin, "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(data ?? {}) }),
  });
}
async function result(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  checks++;
  return response.json();
}
const ctx = (data) => ({ params: Promise.resolve(data) });
async function rejects(fn, status) {
  await assert.rejects(
    async () => fn(),
    (e) => e.status === status,
  );
  checks++;
}
async function snapshot() {
  const tables = (
    await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'ai_%' OR name='user_preferences') ORDER BY name",
    )
  ).rows;
  const output = {};
  for (const t of tables)
    output[t.name] = (
      await db.execute(`SELECT * FROM ${t.name} ORDER BY rowid`)
    ).rows.map((r) => ({ ...r }));
  return JSON.stringify(output);
}
try {
  await db.execute(
    "UPDATE users SET account_role='team_admin' WHERE id='dash-owner'",
  );
  const auth = load(resolve("lib/auth.ts")),
    owner = await auth.userInWorkspace("dash-owner", "dash-ws"),
    outsider = await auth.userInWorkspace("dash-outsider", "dash-ws");
  const repo = load(resolve("lib/chatbot/repository.ts")),
    worker = load(resolve("lib/chatbot/worker.ts")),
    gen = load(resolve("lib/chatbot/generation.ts")),
    scenarios = load(resolve("lib/chatbot/scenarios.ts")),
    policy = load(resolve("lib/chatbot/policy.ts"));
  const policyModule = load(resolve("lib/ai/guardrail-policy.ts")),
    defaults = load(
      resolve("lib/ai/guardrail-types.ts"),
    ).defaultGuardrailPolicy;
  let currentPolicy = { version: 0, policy: { ...defaults } };
  policyModule.activeGuardrailPolicy = async () => currentPolicy;
  const connector = load(resolve("lib/chatbot/connector.ts"));
  connector.connector = async () => {
    connectorCalls++;
    return { answer: "OK" };
  };
  async function processOne() {
    const job = await worker.nextJob();
    assert.ok(job);
    await worker.processJob(job);
    checks++;
  }
  const baseline = await snapshot();
  token = "";
  await result(await route("conversations", "GET")(req("conversations")), 401);
  token = "dash-owner-session";
  await result(
    await route(
      "conversations",
      "POST",
    )(
      req(
        "conversations",
        "POST",
        { clientRequestId: "origin-block" },
        "https://foreign.example",
      ),
    ),
    403,
  );
  assert.equal((await repo.settings(owner)).version, 0);
  assert.equal(
    (await db.execute("SELECT COUNT(*) AS n FROM chatbot_user_settings"))
      .rows[0].n,
    0,
  );
  checks++;
  await repo.saveSettings(owner, {
    ...(await repo.settings(owner)),
    themePreset: "forest",
    expectedVersion: 0,
  });
  await rejects(
    async () =>
      repo.saveSettings(owner, {
        ...(await repo.settings(owner)),
        expectedVersion: 0,
      }),
    409,
  );
  const room = (
    await result(
      await route(
        "conversations",
        "POST",
      )(req("conversations", "POST", { clientRequestId: "room-1" })),
      201,
    )
  ).conversation;
  assert.equal(
    (await repo.createConversation(owner, { clientRequestId: "room-1" })).id,
    room.id,
  );
  checks++;
  await rejects(
    () =>
      repo.createConversation(owner, {
        clientRequestId: "room-1",
        title: "different",
      }),
    409,
  );
  await rejects(() => repo.messages(outsider, room.id), 404);
  async function message(prompt, mode = "chat", extra = {}) {
    return repo.createMessage(owner, room.id, {
      clientRequestId: crypto.randomUUID(),
      prompt,
      mode,
      modelId: mode === "image" ? "gpt-image-chatbot-test" : "gpt-chatbot-test",
      ...extra,
    });
  }
  await rejects(
    () => message("bad model", "chat", { modelId: "gpt-image-chatbot-test" }),
    400,
  );
  const input = {
    clientRequestId: "same-message",
    prompt: "hello",
    mode: "chat",
    modelId: "gpt-chatbot-test",
  };
  const accepted = await repo.createMessage(owner, room.id, input);
  assert.equal(
    (await repo.createMessage(owner, room.id, input)).requestId,
    accepted.requestId,
  );
  checks++;
  await rejects(
    () => repo.createMessage(owner, room.id, { ...input, prompt: "different" }),
    409,
  );
  await processOne();
  assert.equal(
    (await repo.requestStatus(owner, accepted.requestId)).status,
    "completed",
  );
  checks++;
  generatedText = "# 최초 문서\n원본 내용";
  const documentRequest = await message("문서 작성", "file", {
    modelId: "client-model-must-be-ignored",
  });
  await processOne();
  let history = await repo.messages(owner, room.id),
    artifact = history.messages.find((m) => m.artifact)?.artifact;
  assert.ok(artifact);
  checks++;
  const documentCall = JSON.parse(callInputs.at(-1));
  assert.equal(documentCall.model, "gpt-chatbot-test");
  assert.match(documentCall.instructions, /완성된 문서/);
  assert.match(documentCall.instructions, /문서 형식에 맞는 레이아웃/);
  assert.equal(
    (await repo.requestStatus(owner, documentRequest.requestId)).status,
    "completed",
  );
  const initialDocument = await load(
    resolve("lib/chatbot/storage.ts"),
  ).artifactVersion(owner, artifact.id, artifact.versionId);
  assert.equal(initialDocument.content, generatedText);
  await rejects(
    () =>
      load(resolve("lib/chatbot/storage.ts")).artifactVersion(
        outsider,
        artifact.id,
        artifact.versionId,
      ),
    404,
  );
  checks += 2;
  const firstVersion = artifact.versionId;
  generatedText = "# 수정 문서\n수정 내용";
  const editRequest = await message("문서 수정", "file", {
    artifactId: artifact.id,
    baseVersion: artifact.version,
  });
  await processOne();
  const pending = (
    await db.execute({
      sql: "SELECT * FROM chatbot_reviews WHERE request_id=?",
      args: [editRequest.requestId],
    })
  ).rows[0];
  assert.ok(pending);
  checks++;
  assert.equal(
    (
      await db.execute({
        sql: "SELECT current_version_id FROM chatbot_artifacts WHERE id=?",
        args: [artifact.id],
      })
    ).rows[0].current_version_id,
    firstVersion,
  );
  checks++;
  const storage = load(resolve("lib/chatbot/storage.ts")),
    preview = await gen.reviewPreview(owner, String(pending.id));
  assert.ok((await preview.text()).includes("수정 내용"));
  checks++;
  await gen.review(owner, String(pending.id), {
    expectedVersion: 1,
    decision: "approve",
  });
  await rejects(
    () =>
      gen.review(owner, String(pending.id), {
        expectedVersion: 1,
        decision: "approve",
      }),
    409,
  );
  const changed = (
    await db.execute({
      sql: "SELECT * FROM chatbot_artifacts WHERE id=?",
      args: [artifact.id],
    })
  ).rows[0];
  assert.notEqual(changed.current_version_id, firstVersion);
  checks++;
  const downloaded = await storage.artifactVersion(
    owner,
    artifact.id,
    String(changed.current_version_id),
    true,
  );
  assert.ok((await downloaded.text()).includes("수정 내용"));
  checks++;
  const documentImage = await storage.upload(owner, {
    conversationId: room.id,
    name: "document-reference.png",
    mime: "image/png",
    base64: png,
  });
  generatedText =
    "# 제품 안내서\n\n| 항목 | 설명 |\n| --- | --- |\n| 목적 | 안내 |\n\n{{document-image:1}}";
  const illustratedRequest = await message(
    "이미지를 삽입한 안내 문서를 작성",
    "file",
    { attachmentIds: [documentImage.id], modelId: undefined },
  );
  await processOne();
  const illustratedVersion = (
    await db.execute({
      sql: "SELECT * FROM chatbot_artifact_versions WHERE request_id=?",
      args: [illustratedRequest.requestId],
    })
  ).rows[0];
  assert.ok(illustratedVersion);
  const illustrated = await storage.artifactVersion(
    owner,
    String(illustratedVersion.artifact_id),
    String(illustratedVersion.id),
  );
  assert.ok(illustrated.content.includes("data:image/png;base64," + png));
  const source = load(resolve("lib/chatbot/document.ts")).documentSource(
    illustrated.content,
  );
  assert.equal(source.images.length, 1);
  assert.ok(source.content.includes("{{document-image:1}}"));
  const illustratedCall = JSON.parse(callInputs.at(-1));
  assert.ok(
    illustratedCall.input.at(-1).content.some((v) => v.type === "input_image"),
  );
  assert.match(illustratedCall.instructions, /삽입 가능한 참조 이미지는 1개/);
  checks += 3;
  generatedText = "# 수정 안내서\n{{document-image:1}}";
  const illustratedEdit = await message("문서 제목을 수정", "file", {
    artifactId: illustrated.artifactId ?? illustrated.id,
    baseVersion: illustrated.version,
  });
  await processOne();
  const imageDocumentReview = (
    await db.execute({
      sql: "SELECT * FROM chatbot_reviews WHERE request_id=?",
      args: [illustratedEdit.requestId],
    })
  ).rows[0];
  assert.ok(imageDocumentReview);
  const previewDocument = await gen.reviewPreview(
    owner,
    String(imageDocumentReview.id),
  );
  assert.ok(
    (await previewDocument.text()).includes("data:image/png;base64," + png),
  );
  await gen.review(owner, String(imageDocumentReview.id), {
    expectedVersion: 1,
    decision: "approve",
  });
  checks++;
  await rejects(
    () => message("unsupported format", "file", { format: "exe" }),
    400,
  );
  for (const format of ["docx", "pptx", "pdf", "mermaid"]) {
    generatedText =
      format === "mermaid"
        ? 'flowchart TD\n A["시작"] --> B["완료"]'
        : "# 한국어 문서\n\n## 본문\n보존할 원문 내용\n\n| 항목 | 설명 |\n| --- | --- |\n| 기능 | 확인 |";
    const request = await message("형식별 문서 작성", "file", { format });
    await processOne();
    assert.equal(
      (await repo.requestStatus(owner, request.requestId)).status,
      "completed",
    );
    const version = (
      await db.execute({
        sql: "SELECT * FROM chatbot_artifact_versions WHERE request_id=?",
        args: [request.requestId],
      })
    ).rows[0];
    assert.ok(version);
    assert.equal(version.format, format === "mermaid" ? "mmd" : format);
    const data = await storage.artifactVersion(
      owner,
      String(version.artifact_id),
      String(version.id),
    );
    assert.equal(data.content, generatedText);
    assert.equal(data.format, format);
    const download = await storage.artifactVersion(
      owner,
      String(version.artifact_id),
      String(version.id),
      true,
    );
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.ok(
      download.headers
        .get("content-disposition")
        .includes("." + (format === "mermaid" ? "mmd" : format)),
    );
    if (format === "pdf")
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    else if (format !== "mermaid")
      assert.equal(bytes.readUInt32LE(0), 0x04034b50);
    else assert.ok(bytes.toString().startsWith("flowchart TD"));
    const original = generatedText;
    generatedText =
      format === "mermaid"
        ? 'flowchart TD\n A["수정"] --> B["완료"]'
        : "# 수정 문서\n수정된 본문 내용";
    const edited = await message("형식별 문서 수정", "file", {
      format,
      artifactId: String(version.artifact_id),
      baseVersion: 1,
    });
    await processOne();
    assert.equal(
      (await repo.requestStatus(owner, edited.requestId)).status,
      "waiting_review",
    );
    const modelInput = JSON.parse(callInputs.at(-1));
    assert.ok(modelInput.input.at(-1).content[0].text.includes(original));
    const review = (
      await db.execute({
        sql: "SELECT * FROM chatbot_reviews WHERE request_id=?",
        args: [edited.requestId],
      })
    ).rows[0];
    const nextVersion = (
      await db.execute({
        sql: "SELECT * FROM chatbot_artifact_versions WHERE request_id=?",
        args: [edited.requestId],
      })
    ).rows[0];
    await rejects(
      () =>
        storage.artifactVersion(
          owner,
          String(version.artifact_id),
          String(nextVersion.id),
          true,
        ),
      404,
    );
    const count = calls;
    await gen.review(owner, String(review.id), {
      expectedVersion: 1,
      decision: "approve",
    });
    assert.equal(calls, count);
    const published = await storage.artifactVersion(
      owner,
      String(version.artifact_id),
      String(nextVersion.id),
    );
    assert.equal(published.content, generatedText);
    checks += 4;
  }
  const imageReq = await message("이미지 생성", "image", {
    modelId: "ignored-client-model",
  });
  await processOne();
  assert.equal(
    (await repo.requestStatus(owner, imageReq.requestId)).status,
    "completed",
  );
  checks++;
  const beforeCalls = calls;
  currentPolicy = {
    version: 0,
    policy: { ...defaults, blockedTerms: ["BLOCKED_FIXTURE"] },
  };
  generatedText = "BLOCKED_FIXTURE";
  const paused = await message("승인 재개 테스트");
  await processOne();
  assert.equal(
    (await repo.requestStatus(owner, paused.requestId)).status,
    "waiting_policy_approval",
  );
  checks++;
  let approval = (
    await db.execute({
      sql: "SELECT * FROM chatbot_policy_approvals WHERE request_id=?",
      args: [paused.requestId],
    })
  ).rows[0];
  assert.equal(approval.status, "awaiting_choice");
  await policy.policyApproval(
    owner,
    String(approval.id),
    { expectedVersion: 1 },
    "request",
  );
  await db.execute({
    sql: "UPDATE chatbot_policy_approvals SET status='approved',version=version+1 WHERE id=?",
    args: [approval.id],
  });
  await policy.policyApproval(
    owner,
    String(approval.id),
    { expectedVersion: 3 },
    "resume",
  );
  await processOne();
  assert.equal(calls, beforeCalls + 1);
  assert.equal(
    (await repo.requestStatus(owner, paused.requestId)).status,
    "completed",
  );
  checks += 2;
  generatedText = "정상 답변";
  currentPolicy = { version: 0, policy: { ...defaults } };
  const graph = {
    nodes: [
      { id: "a", type: "message", data: { content: "Welcome" } },
      { id: "b", type: "slotfilling", data: { content: "이름", slot: "name" } },
      {
        id: "c",
        type: "form",
        data: { elements: [{ id: "age", type: "input", required: true }] },
      },
      { id: "d", type: "message", data: { content: "Hello {{name}}" } },
    ],
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
      { id: "cd", source: "c", target: "d" },
    ],
    startNodeId: "a",
  };
  for (const [id, enabled, deployed, deletedAt] of [
    ["command-on", 1, 1, null],
    ["command-off", 0, 1, null],
    ["command-draft", 1, null, null],
    ["command-deleted", 1, 1, new Date().toISOString()],
  ]) {
    await db.execute({
      sql: "INSERT INTO builder_scenarios(id,workspace_id,name,definition_json,created_by,updated_by,created_at,updated_at,command_enabled,deployed_version,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      args: [id, owner.workspaceId, id, JSON.stringify(graph), owner.id, owner.id, new Date().toISOString(), new Date().toISOString(), enabled, deployed, deletedAt],
    });
  }
  assert.deepEqual((await scenarios.availableScenarios(owner, true)).scenarios.map((row) => row.id), ["command-on"]);
  assert.deepEqual((await scenarios.availableScenarios(owner)).scenarios.map((row) => row.id), ["command-off", "command-on"]);
  checks += 2;
  const beforeRooms = (
    await db.execute("SELECT COUNT(*) AS n FROM chatbot_conversations")
  ).rows[0].n;
  const run = await scenarios.createRun(owner, {
    source: "builder-simulation",
    definition: graph,
    clientRequestId: "run-1",
  });
  await processOne();
  let detail = await scenarios.getRun(owner, run.id);
  assert.equal(detail.status, "waiting_input");
  assert.equal(detail.currentNode.id, "b");
  checks += 2;
  await scenarios.submitInput(owner, run.id, {
    clientRequestId: "input-1",
    expectedRunVersion: detail.version,
    nodeId: "b",
    value: "Kim",
  });
  await processOne();
  detail = await scenarios.getRun(owner, run.id);
  await rejects(
    () =>
      scenarios.submitInput(owner, run.id, {
        clientRequestId: "invalid-form",
        expectedRunVersion: detail.version,
        nodeId: "c",
        values: {},
      }),
    400,
  );
  await scenarios.submitInput(owner, run.id, {
    clientRequestId: "input-2",
    expectedRunVersion: detail.version,
    nodeId: "c",
    values: { age: "30" },
  });
  await processOne();
  detail = await scenarios.getRun(owner, run.id);
  assert.equal(detail.status, "completed");
  assert.ok(detail.events.some((e) => e.text === "Hello Kim"));
  assert.equal(
    (await db.execute("SELECT COUNT(*) AS n FROM chatbot_conversations"))
      .rows[0].n,
    beforeRooms,
  );
  checks += 3;
  await rejects(
    () =>
      scenarios.createRun(outsider, {
        source: "builder-simulation",
        definition: graph,
        clientRequestId: "forbidden-run",
      }),
    403,
  );
  const apiRun = await scenarios.createRun(owner, {
    source: "builder-simulation",
    definition: {
      nodes: [
        {
          id: "api",
          type: "api",
          data: {
            url: "https://example.org/test",
            method: "POST",
            body: "{}",
            responseMapping: [{ slot: "answer", path: "answer" }],
          },
        },
      ],
      edges: [],
      startNodeId: "api",
    },
    clientRequestId: "api-run",
  });
  await processOne();
  detail = await scenarios.getRun(owner, apiRun.id);
  assert.equal(detail.status, "waiting_review");
  assert.equal(connectorCalls, 0);
  checks += 2;
  const apiReview = detail.events.find((e) => e.review).review;
  await gen.review(owner, apiReview.id, {
    expectedVersion: apiReview.version,
    decision: "approve",
  });
  await processOne();
  detail = await scenarios.getRun(owner, apiRun.id);
  assert.equal(detail.status, "completed");
  assert.equal(connectorCalls, 1);
  assert.equal(detail.slots.answer, "OK");
  checks += 3;
  await rejects(() => connector.connectorURL("http://127.0.0.1/private"), 403);
  await rejects(
    () =>
      scenarios.createRun(owner, {
        source: "builder-simulation",
        definition: {
          nodes: [{ id: "x", type: "unknown", data: {} }],
          edges: [],
        },
        clientRequestId: "bad-node",
      }),
    400,
  );

  const graphTools = load(resolve("app/(builder)/server/chatbot-graph.ts"));
  const gridNode = {
    id: "grid-form",
    type: "form",
    data: {
      slotKey: "formData",
      elements: [
        {
          name: "rows",
          type: "grid",
          columns: 2,
          hasHeader: true,
          data: ["id", "name", "A1", "Alice", "A2", "Bob"],
        },
      ],
    },
  };
  const gridValues = graphTools.inputValues(gridNode, { rows: [1] }, {});
  assert.deepEqual(gridValues.rows, [{ id: "A2", name: "Bob" }]);
  checks++;
  await rejects(
    () => graphTools.inputValues(gridNode, { rows: [99] }, {}),
    400,
  );
  const dateNode = {
    id: "date-form",
    type: "form",
    data: {
      elements: [
        { name: "period", type: "date", hasFromTo: true, required: true },
      ],
    },
  };
  const dateValues = graphTools.inputValues(
    dateNode,
    { "period.from": "2026-11-25", "period.to": "2026-11-26" },
    {},
  );
  assert.equal(
    dateValues.period.from.date,
    Date.parse("2026-11-25T00:00:00+09:00"),
  );
  checks++;
  await rejects(
    () =>
      graphTools.inputValues(
        dateNode,
        { "period.from": "2026-02-31", "period.to": "2026-11-26" },
        {},
      ),
    400,
  );
  await rejects(
    () =>
      graphTools.inputValues(
        {
          id: "options",
          type: "form",
          data: {
            elements: [{ id: "choice", type: "dropbox", options: ["A", "B"] }],
          },
        },
        { choice: "tampered" },
        {},
      ),
    400,
  );
  await rejects(
    () =>
      graphTools.inputValues(
        {
          id: "required",
          type: "form",
          data: {
            elements: [{ id: "agree", type: "checkbox", required: true }],
          },
        },
        { agree: false },
        {},
      ),
    400,
  );
  connector.connector = async () => {
    connectorCalls++;
    throw new connector.ConnectorHTTPError();
  };
  const failureRun = await scenarios.createRun(owner, {
    source: "builder-simulation",
    clientRequestId: "api-error-run",
    definition: {
      nodes: [
        {
          id: "api",
          type: "api",
          data: { url: "https://example.org/failure", method: "POST" },
        },
        { id: "error", type: "message", data: { content: "오류 분기" } },
        { id: "success", type: "message", data: { content: "성공 분기" } },
      ],
      edges: [
        {
          id: "error-edge",
          source: "api",
          target: "error",
          sourceHandle: "onError",
        },
        {
          id: "success-edge",
          source: "api",
          target: "success",
          sourceHandle: "onSuccess",
        },
      ],
      startNodeId: "api",
    },
  });
  await processOne();
  let failedDetail = await scenarios.getRun(owner, failureRun.id);
  const failedReview = failedDetail.events.find((e) => e.review).review;
  await gen.review(owner, failedReview.id, {
    expectedVersion: failedReview.version,
    decision: "approve",
  });
  await processOne();
  failedDetail = await scenarios.getRun(owner, failureRun.id);
  assert.equal(failedDetail.status, "completed");
  assert.ok(failedDetail.events.some((e) => e.text === "오류 분기"));
  assert.ok(!failedDetail.events.some((e) => e.text === "성공 분기"));
  checks += 3;
  const beforeSecret = calls,
    secretRequest = await message(process.env.OPENAI_API_KEY);
  await processOne();
  assert.equal(
    (await repo.requestStatus(owner, secretRequest.requestId)).status,
    "failed",
  );
  assert.equal(calls, beforeSecret);
  assert.ok(
    (
      await db.execute({
        sql: "SELECT id FROM chatbot_policy_events WHERE request_id=?",
        args: [secretRequest.requestId],
      })
    ).rows.length,
  );
  checks += 3;
  const secondEdit = await message("거절 테스트", "file", {
    artifactId: artifact.id,
    baseVersion: Number(changed.version),
  });
  await processOne();
  const rejectReview = (
    await db.execute({
      sql: "SELECT id FROM chatbot_reviews WHERE request_id=?",
      args: [secondEdit.requestId],
    })
  ).rows[0];
  currentPolicy = { version: 1, policy: { ...defaults } };
  await rejects(
    () =>
      gen.review(owner, String(rejectReview.id), {
        expectedVersion: 1,
        decision: "approve",
      }),
    409,
  );
  await gen.review(owner, String(rejectReview.id), {
    expectedVersion: 1,
    decision: "reject",
  });
  assert.equal(
    (
      await db.execute({
        sql: "SELECT current_version_id FROM chatbot_artifacts WHERE id=?",
        args: [artifact.id],
      })
    ).rows[0].current_version_id,
    changed.current_version_id,
  );
  checks++;
  currentPolicy = { version: 0, policy: { ...defaults } };
  await rejects(
    () =>
      storage.upload(owner, {
        conversationId: room.id,
        name: "bad.jpg",
        mime: "image/jpeg",
        base64: "AA==",
      }),
    415,
  );
  const staleBlob = "chatbot/dash-ws/dash-owner/stale-test";
  blobs.set(staleBlob, Buffer.from("test"));
  await db.execute({
    sql: "INSERT INTO chatbot_blob_uploads(id,workspace_id,user_id,storage_key,status,created_at) VALUES ('stale-test','dash-ws','dash-owner',?,'staged','2000-01-01T00:00:00Z')",
    args: [staleBlob],
  });
  await worker.cleanup();
  assert.equal(blobs.has(staleBlob), false);
  checks++;

  const eventTx = await db.transaction("write"),
    longRun = (
      await db.execute({
        sql: "SELECT next_seq FROM chatbot_scenario_runs WHERE id=?",
        args: [run.id],
      })
    ).rows[0];
  const cryptoHelpers = load(resolve("lib/chatbot/server.ts"));
  try {
    for (let i = 0; i < 510; i++) {
      const eid = crypto.randomUUID();
      await eventTx.execute({
        sql: "INSERT INTO chatbot_scenario_run_events(id,workspace_id,user_id,run_id,seq,node_id,node_attempt,event_type,payload_ciphertext,created_at) VALUES (?,?,?,?,?,'long',0,'node_completed',?,?)",
        args: [
          eid,
          owner.workspaceId,
          owner.id,
          run.id,
          Number(longRun.next_seq) + i,
          cryptoHelpers.seal(owner, eid, { text: "Long event " + i }),
          new Date().toISOString(),
        ],
      });
    }
    await eventTx.execute({
      sql: "UPDATE chatbot_scenario_runs SET next_seq=next_seq+510 WHERE id=?",
      args: [run.id],
    });
    await eventTx.commit();
  } catch (e) {
    await eventTx.rollback();
    throw e;
  } finally {
    eventTx.close();
  }
  const firstPage = await scenarios.getRun(owner, run.id);
  assert.equal(firstPage.events.length, 500);
  assert.ok(firstPage.nextCursor);
  checks += 2;
  const nextPage = await result(
    await route("scenario-runs/[runId]/events", "GET")(
      req("scenario-runs/" + run.id + "/events?after=" + firstPage.nextCursor),
      ctx({ runId: run.id }),
    ),
  );
  assert.ok(nextPage.events[0].seq > firstPage.events.at(-1).seq);
  assert.equal(nextPage.nextCursor, null);
  checks += 2;

  currentPolicy = { version: 0, policy: { ...defaults } };
  const clarification = load(resolve("lib/chatbot/clarification.ts"));
  const decisionFor = (field = "purpose") => ({
    kind: "clarify",
    intent: "general.clarify",
    field,
    title: "목적 선택",
    text: "어떤 방향으로 정리할까요?",
    options: [
      { id: "summary", label: "요약", value: "핵심 요약", action: "select" },
      { id: "other", label: "다른 목적", value: "", action: "custom" },
    ],
    allowCustom: true,
  });
  const pendingCard = async (rid) => {
    const r = await load(resolve("lib/chatbot/server.ts")).owned(
      "chatbot_requests",
      owner,
      rid,
    );
    return (await clarification.requestClarifications(owner, r)).at(-1);
  };
  generatedDecision = decisionFor();
  const choiceRequest = await message("이 내용을 정리해줘");
  const beforeDecisionCalls = calls;
  await processOne();
  assert.equal(calls, beforeDecisionCalls + 1);
  const card = await pendingCard(choiceRequest.requestId);
  assert.equal(card.canAnswer, true);
  assert.equal(
    (await repo.requestStatus(owner, choiceRequest.requestId)).status,
    "waiting_clarification",
  );
  const pausedRow = await load(resolve("lib/chatbot/server.ts")).owned(
    "chatbot_requests",
    owner,
    choiceRequest.requestId,
  );
  assert.equal(pausedRow.lease_until, null);
  assert.equal(pausedRow.finished_at, null);
  checks += 3;
  await repo.stopConversation(owner, room.id);
  assert.equal(
    (await clarification.getClarification(owner, card.id)).canAnswer,
    true,
  );
  checks++;
  await rejects(() => clarification.getClarification(outsider, card.id), 404);
  await result(
    await route("clarifications/[clarificationId]/answers", "POST")(
      req(
        "clarifications/" + card.id + "/answers",
        "POST",
        {
          expectedVersion: 1,
          clientRequestId: "bad-origin",
          optionId: "summary",
        },
        "https://bad.invalid",
      ),
      ctx({ clarificationId: card.id }),
    ),
    403,
  );
  await rejects(
    () =>
      clarification.answerClarification(owner, card.id, {
        expectedVersion: 0,
        clientRequestId: "old-version",
        optionId: "summary",
      }),
    409,
  );
  await rejects(
    () =>
      clarification.answerClarification(owner, card.id, {
        expectedVersion: 1,
        clientRequestId: "forged-choice",
        optionId: "forged",
      }),
    400,
  );
  generatedDecision = null;
  generatedText = "다른 질문의 답변";
  const otherQuestion = await message("이 질문은 별개입니다");
  await rejects(
    () =>
      clarification.answerClarification(owner, card.id, {
        expectedVersion: 1,
        clientRequestId: "busy-choice",
        optionId: "summary",
      }),
    409,
  );
  assert.equal(
    (await clarification.getClarification(owner, card.id)).version,
    1,
  );
  checks++;
  await processOne();
  assert.equal(
    (await repo.requestStatus(owner, otherQuestion.requestId)).status,
    "completed",
  );
  checks++;
  const selected = {
    expectedVersion: 1,
    clientRequestId: "choice-replay",
    optionId: "summary",
  };
  await result(
    await route("clarifications/[clarificationId]/answers", "POST")(
      req("clarifications/" + card.id + "/answers", "POST", selected),
      ctx({ clarificationId: card.id }),
    ),
    202,
  );
  await clarification.answerClarification(owner, card.id, selected);
  await rejects(
    () =>
      clarification.answerClarification(owner, card.id, {
        ...selected,
        optionId: "other",
        customValue: "다른 값",
      }),
    409,
  );
  generatedText = "핵심 요약을 완료했습니다.";
  await processOne();
  assert.equal(
    (await repo.requestStatus(owner, choiceRequest.requestId)).status,
    "completed",
  );
  const resumedCall = JSON.parse(callInputs.at(-1));
  assert.ok(resumedCall.instructions.includes("핵심 요약"));
  assert.ok(
    !JSON.stringify(resumedCall.input).includes("이 질문은 별개입니다"),
  );
  checks += 2;
  const completedCards = await pendingCard(choiceRequest.requestId);
  assert.equal(completedCards.status, "answered");
  assert.equal(completedCards.selected.label, "요약");
  checks++;
  const countAfterResume = calls;
  await clarification.getClarification(owner, card.id);
  await repo.messages(owner, room.id);
  assert.equal(calls, countAfterResume);
  checks++;
  await assert.rejects(() =>
    db.execute({
      sql: "UPDATE chatbot_request_steps SET output_ciphertext='tampered' WHERE request_id=? AND status='completed'",
      args: [choiceRequest.requestId],
    }),
  );
  checks++;
  generatedDecision = decisionFor("target");
  const customRequest = await message("어떤 대상으로 할지 모호한 요청");
  await processOne();
  const customCard = await pendingCard(customRequest.requestId);
  await clarification.answerClarification(owner, customCard.id, {
    expectedVersion: 1,
    clientRequestId: "custom-answer",
    optionId: "other",
    customValue: "관리자 교육용",
  });
  generatedDecision = null;
  generatedText = "관리자 교육용으로 정리했습니다.";
  await processOne();
  assert.ok(
    JSON.parse(callInputs.at(-1)).instructions.includes("관리자 교육용"),
  );
  checks++;
  generatedDecision = decisionFor();
  const cancelChoice = await message("취소 테스트");
  await processOne();
  const cancelCard = await pendingCard(cancelChoice.requestId);
  currentPolicy = { version: 7, policy: { ...defaults } };
  await rejects(
    () =>
      clarification.answerClarification(owner, cancelCard.id, {
        expectedVersion: 1,
        clientRequestId: "policy-stale",
        optionId: "summary",
      }),
    409,
  );
  await clarification.answerClarification(
    owner,
    cancelCard.id,
    { expectedVersion: 1, clientRequestId: "cancel-choice" },
    true,
  );
  assert.equal(
    (await repo.requestStatus(owner, cancelChoice.requestId)).status,
    "cancelled",
  );
  checks++;
  currentPolicy = { version: 0, policy: { ...defaults } };
  generatedDecision = decisionFor();
  const expires = await message("만료 테스트");
  await processOne();
  const expiresCard = await pendingCard(expires.requestId);
  await db.execute({
    sql: "UPDATE chatbot_clarifications SET expires_at='2000-01-01T00:00:00Z' WHERE id=?",
    args: [expiresCard.id],
  });
  await worker.cleanup();
  assert.equal(
    (await clarification.getClarification(owner, expiresCard.id)).status,
    "expired",
  );
  assert.equal(
    (await repo.requestStatus(owner, expires.requestId)).status,
    "cancelled",
  );
  checks += 2;
  generatedDecision = decisionFor();
  const rounds = await message("다단계 선택 테스트");
  await processOne();
  for (let i = 0; i < 3; i++) {
    const roundCard = await pendingCard(rounds.requestId);
    assert.equal(roundCard.round, i + 1);
    await clarification.answerClarification(owner, roundCard.id, {
      expectedVersion: 1,
      clientRequestId: "round-" + i,
      optionId: "summary",
    });
    generatedDecision = i === 2 ? null : decisionFor("field_" + i);
    generatedText = "확정 조건을 반영했습니다.";
    await processOne();
  }
  assert.equal(
    (await repo.requestStatus(owner, rounds.requestId)).status,
    "completed",
  );
  checks += 4;
  generatedDecision = {
    ...decisionFor(),
    options: [
      { id: "x", label: "A", value: "a", action: "select" },
      { id: "x", label: "B", value: "b", action: "select" },
    ],
  };
  const invalidDecision = await message("잘못된 모델 형식");
  await processOne();
  assert.equal(
    (await repo.requestStatus(owner, invalidDecision.requestId)).status,
    "failed",
  );
  checks++;
  generatedDecision = decisionFor();
  const guardedChoice = await message("선택 내용 정책 검사");
  await processOne();
  const guardedCard = await pendingCard(guardedChoice.requestId);
  await clarification.answerClarification(owner, guardedCard.id, {
    expectedVersion: 1,
    clientRequestId: "guarded-selection",
    customValue: "CHOICE_BLOCK",
  });
  currentPolicy = {
    version: 0,
    policy: { ...defaults, blockedTerms: ["CHOICE_BLOCK"] },
  };
  const beforeBlockedCall = calls;
  await processOne();
  assert.equal(calls, beforeBlockedCall);
  assert.equal(
    (await repo.requestStatus(owner, guardedChoice.requestId)).status,
    "waiting_policy_approval",
  );
  checks += 2;
  const choiceApproval = (
    await db.execute({
      sql: "SELECT * FROM chatbot_policy_approvals WHERE request_id=?",
      args: [guardedChoice.requestId],
    })
  ).rows[0];
  await policy.policyApproval(
    owner,
    String(choiceApproval.id),
    { expectedVersion: 1 },
    "request",
  );
  await db.execute({
    sql: "UPDATE chatbot_policy_approvals SET status='approved',version=version+1 WHERE id=?",
    args: [choiceApproval.id],
  });
  await policy.policyApproval(
    owner,
    String(choiceApproval.id),
    { expectedVersion: 3 },
    "resume",
  );
  generatedDecision = null;
  generatedText = "허용된 선택을 처리했습니다.";
  await processOne();
  assert.equal(
    (await repo.requestStatus(owner, guardedChoice.requestId)).status,
    "completed",
  );
  assert.equal(calls, beforeBlockedCall + 1);
  checks += 2;
  currentPolicy = { version: 0, policy: { ...defaults } };
  generatedDecision = null;

  generatedDecision = decisionFor();
  const raceA = await message("동시 선택 A");
  await processOne();
  const raceCardA = await pendingCard(raceA.requestId);
  const raceB = await message("동시 선택 B");
  await processOne();
  const raceCardB = await pendingCard(raceB.requestId);
  const attempts = await Promise.allSettled([
    clarification.answerClarification(owner, raceCardA.id, {
      expectedVersion: 1,
      clientRequestId: "race-a",
      optionId: "summary",
    }),
    clarification.answerClarification(owner, raceCardB.id, {
      expectedVersion: 1,
      clientRequestId: "race-b",
      optionId: "summary",
    }),
  ]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    attempts.find((r) => r.status === "rejected").reason.status,
    409,
  );
  checks++;
  generatedDecision = null;
  await processOne();
  const remaining = attempts[0].status === "rejected" ? raceCardA : raceCardB;
  await clarification.answerClarification(owner, remaining.id, {
    expectedVersion: 1,
    clientRequestId: "race-retry",
    optionId: "summary",
  });
  await processOne();
  checks++;
  await assert.rejects(() =>
    db.execute(
      "UPDATE chatbot_clarification_events SET event_type='cancelled' WHERE event_type='answered'",
    ),
  );
  checks++;
  generatedDecision = { ...decisionFor(), text: "QUESTION_BLOCK 선택 안내" };
  currentPolicy = {
    version: 0,
    policy: { ...defaults, blockedTerms: ["QUESTION_BLOCK"] },
  };
  const questionPolicy = await message("정리 조건을 골라야 합니다");
  await processOne();
  const beforeQuestionResume = calls;
  assert.equal(
    (await repo.requestStatus(owner, questionPolicy.requestId)).status,
    "waiting_policy_approval",
  );
  const questionApproval = (
    await db.execute({
      sql: "SELECT * FROM chatbot_policy_approvals WHERE request_id=?",
      args: [questionPolicy.requestId],
    })
  ).rows[0];
  await policy.policyApproval(
    owner,
    String(questionApproval.id),
    { expectedVersion: 1 },
    "request",
  );
  await db.execute({
    sql: "UPDATE chatbot_policy_approvals SET status='approved',version=version+1 WHERE id=?",
    args: [questionApproval.id],
  });
  await policy.policyApproval(
    owner,
    String(questionApproval.id),
    { expectedVersion: 3 },
    "resume",
  );
  await processOne();
  assert.equal(calls, beforeQuestionResume);
  assert.equal(
    (await repo.requestStatus(owner, questionPolicy.requestId)).status,
    "waiting_clarification",
  );
  const questionCard = await pendingCard(questionPolicy.requestId);
  await clarification.answerClarification(
    owner,
    questionCard.id,
    { expectedVersion: 1, clientRequestId: "cancel-guard-question" },
    true,
  );
  checks += 3;
  currentPolicy = { version: 0, policy: { ...defaults } };
  generatedDecision = null;

  const queuedStop = await message("닫기 중단");
  await result(
    await route("conversations/[conversationId]/stop", "POST")(
      req("conversations/" + room.id + "/stop", "POST"),
      ctx({ conversationId: room.id }),
    ),
  );
  assert.equal(
    (await repo.requestStatus(owner, queuedStop.requestId)).status,
    "cancelled",
  );
  checks++;
  assert.equal(await snapshot(), baseline, "AI Chat data was modified");
  checks++;
  assert.equal((await db.execute("PRAGMA foreign_key_check")).rows.length, 0);
  assert.equal(
    (await db.execute("PRAGMA integrity_check")).rows[0].integrity_check,
    "ok",
  );
  checks += 2;
  assert.ok(blobs.size >= 3);
  assert.ok(
    [...blobs.values()].every((v) => !v.toString().includes("원본 내용")),
  );
  checks++;
  console.log(
    `Chatbot integration: ${checks} checks passed; ${calls} mock paid calls; AI Chat tables unchanged.`,
  );
} finally {
  globalThis.fetch = originalFetch;
  db.close();
}
