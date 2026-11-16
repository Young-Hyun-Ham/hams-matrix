// Isolated DB and mock provider. Never load .env or use production credentials.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import ts from "typescript";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const fixture = await dashboardFixture(),
  client = fixture.db;
const require = createRequire(import.meta.url),
  cache = new Map(),
  objects = new Map();
let token = "dash-owner-session",
  failure = false,
  badVector = false,
  onEmbedding = null,
  calls = 0;
let classifierReply = null;
let failAtCall = Infinity;
const embeddingInputs = [];
process.env.APP_URL = "http://localhost:3000";
process.env.OPENAI_API_KEY = "synthetic-chat-key";
process.env.OPENAI_MODELS = "gpt-test";
process.env.AI_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString("base64");
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (url === "https://api.openai.com/v1/responses" && classifierReply !== null)
    return Response.json({
      id: "mock-classifier",
      model: "gpt-test",
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: classifierReply }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    });
  if (url === "https://api.openai.com/v1/models")
    return Response.json({
      data: [
        { id: "gpt-test" },
        { id: "text-embedding-test" },
        { id: "image-test" },
      ],
    });
  assert.equal(url, "https://api.openai.com/v1/embeddings");
  assert.equal(options.headers.Authorization, "Bearer synthetic-embedding-key");
  calls++;
  if (failure || calls === failAtCall)
    return Response.json({}, { status: 401 });
  const input = JSON.parse(options.body);
  embeddingInputs.push(...input.input);
  if (onEmbedding) {
    const fn = onEmbedding;
    onEmbedding = null;
    await fn();
  }
  return Response.json({
    model: input.model,
    data: input.input.map((text, index) => ({
      index,
      embedding: badVector ? [0, 0, 0] : [1, 1, 0.25],
    })),
    usage: {
      prompt_tokens: input.input.length,
      total_tokens: input.input.length,
    },
  });
};
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => client };
  if (file === resolve("lib/r2.ts"))
    return {
      getDocument: async (key) => {
        assert.ok(objects.has(key));
        return objects.get(key);
      },
    };
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
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
      const target = [base, base + ".ts", base + ".tsx"].find(existsSync);
      assert.ok(target, base);
      return load(target);
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const source = load(resolve("lib/ai/rag-sources.ts"));
const rag = load(resolve("lib/ai/project-rag.ts"));
const { resumeRagJob } = load(resolve("lib/ai/rag-resume.ts"));
const { ragHash } = load(resolve("lib/ai/rag-chunks.ts"));
const worker = load(resolve("lib/ai/rag-worker.ts"));
const retrieval = load(resolve("lib/ai/rag-retrieval.ts"));
const crypto = load(resolve("lib/ai/credentials.ts"));
const intent = load(resolve("lib/ai/intent-classifier.ts"));
const { restrictAgent } = load(resolve("lib/ai/orchestration.ts"));
const { requireUser } = load(resolve("lib/auth.ts"));
const checkpoint = async () => {};
const input = (version, key) => ({
  model: "text-embedding-test",
  apiKey: "synthetic-embedding-key",
  expectedConfigVersion: version,
  idempotencyKey: key,
});
const request = (data) =>
  new Request("http://localhost:3000/test", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
const routeParams = { params: Promise.resolve({ projectId: "dash-p1" }) };
let nativeVectors = false;
try {
  await client.execute(
    "SELECT vector_distance_cos(vector32('[1,0]'),vector32('[1,0]'))",
  );
  nativeVectors = true;
} catch {}
try {
  const owner = await requireUser();
  assert.equal((await rag.ragSummary(owner, "dash-p1")).canManage, true);
  token = "dash-viewer-session";
  const viewer = await requireUser();
  await assert.rejects(
    () => rag.startRagJob(viewer, "dash-p1", input(0, "denied-key")),
    /owner\/admin/,
  );
  await assert.rejects(() => rag.ragSummary(viewer, "dash-foreign-p"));
  token = "dash-owner-session";
  assert.equal(
    intent.ruleIntent("요구사항 설명해 줘").plan.primaryIntent,
    "rag",
  );
  assert.equal(
    intent.ruleIntent("현재 WBS 진척률은?").plan.primaryIntent,
    "realtime",
  );
  assert.equal(
    intent.ruleIntent("요구사항을 등록해줘").plan.primaryIntent,
    "execution",
  );
  assert.equal(
    intent.ruleIntent("삭제 정책을 설명해줘").plan.needsExecution,
    false,
  );
  assert.equal(
    intent.ruleIntent("삭제하지 말고 설명해줘").plan.needsExecution,
    false,
  );
  assert.equal(
    intent.ruleIntent("이거 처리해줘").plan.needsClarification,
    true,
  );
  const classifyOptions = {
    prompt: "이거 처리해줘",
    model: "gpt-test",
    history: [],
    checkpoint,
    track: async () => {},
    deadline: Date.now() + 30000,
  };
  classifierReply = JSON.stringify({
    primaryIntent: "execution",
    needsClarification: false,
  });
  assert.equal(
    (await intent.classifyIntent(classifyOptions)).needsExecution,
    false,
    "classifier cannot authorize writes",
  );
  classifierReply = JSON.stringify({
    primaryIntent: "realtime",
    needsClarification: false,
  });
  assert.equal(
    (await intent.classifyIntent(classifyOptions)).primaryIntent,
    "realtime",
  );
  classifierReply = "invalid JSON";
  assert.equal(
    (await intent.classifyIntent(classifyOptions)).reasonCode,
    "CLASSIFIER_UNAVAILABLE",
  );
  classifierReply = null;
  const guarded = restrictAgent(
    {
      tools: [{ name: "read_page" }, { name: "save_artifact" }],
      execute: async (name) => name,
    },
    false,
  );
  assert.equal(guarded.tools.length, 1);
  await assert.rejects(() => guarded.execute("save_artifact", {}));
  const row = crypto.encryptCredential(
    "synthetic-embedding-key",
    "c",
    "w",
    "p",
  );
  assert.throws(() =>
    crypto.decryptCredential(
      { ...row, id: "c", workspace_id: "x", project_id: "p" },
      "w",
      "p",
    ),
  );
  const modelRoute = load(
    resolve("app/api/projects/[projectId]/rag/models/route.ts"),
  );
  const modelResult = await modelRoute.POST(
    request({ apiKey: "synthetic-embedding-key" }),
    routeParams,
  );
  assert.equal(modelResult.status, 200);
  assert.deepEqual((await modelResult.json()).models, ["text-embedding-test"]);
  for (let i = 0; i < 305; i++)
    await client.execute({
      sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES (?,'dash-ws','dash-p1','requirement',?,?,'초안',?,'{}',1,'dash-owner','dash-owner',?,?)",
      args: [
        `rag-${String(i).padStart(4, "0")}`,
        `REQ-${String(i).padStart(4, "0")}`,
        `상세 자료 ${i}`,
        JSON.stringify({
          definition: i === 304 ? "끝부분 검색 검증" : "일반 요구사항",
        }),
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    });
  const stamp = new Date().toISOString();
  await client.execute({
    sql: "INSERT INTO project_rfp_documents(id,project_id,workspace_id,document_json,created_by,updated_by,created_at,updated_at) VALUES ('rag-rfp','dash-p1','dash-ws',?,'dash-owner','dash-owner',?,?)",
    args: [
      JSON.stringify({
        title: "긴 RFP",
        appendix: "긴 본문 ".repeat(6000) + "END_RFP_SENTINEL",
      }),
      stamp,
      stamp,
    ],
  });
  await client.execute({
    sql: "INSERT INTO project_files(id,workspace_id,project_id,name,object_key,byte_length,mime_type,created_by) VALUES ('rag-txt','dash-ws','dash-p1','근거.txt','test-text',30,'text/plain','dash-owner'),('rag-img','dash-ws','dash-p1','참고.png','test-image',20,'image/png','dash-owner')",
    args: [],
  });
  objects.set("test-text", Buffer.from("파일 원문 검색 근거"));
  const all = await source.collectRagSources(owner, "dash-p1");
  assert.ok(all.filter((s) => s.type === "artifact").length > 300);
  assert.ok(
    all.find((s) => s.type === "rfp").text.includes("END_RFP_SENTINEL"),
  );
  assert.ok(
    !all.some((s) => s.id === "dash-deleted" || s.id === "dash-secret"),
  );
  const started = await rag.startRagJob(
    owner,
    "dash-p1",
    input(0, "index-first"),
  );
  assert.equal(
    (await rag.startRagJob(owner, "dash-p1", input(0, "index-first"))).id,
    started.id,
  );
  await assert.rejects(() =>
    rag.startRagJob(owner, "dash-p1", {
      ...input(0, "index-first"),
      model: "text-embedding-other",
    }),
  );
  await assert.rejects(() =>
    rag.startRagJob(owner, "dash-p1", input(1, "index-concurrent")),
  );
  const first = await worker.processNextRagJob();
  assert.ok(first);
  assert.equal(await worker.processNextRagJob(), null);
  await first.run();
  let status = await rag.ragSummary(owner, "dash-p1");
  assert.equal(
    status.latestJob.status,
    "completed",
    JSON.stringify(await rag.readRagJob(owner, "dash-p1", started.id)),
  );
  assert.ok(status.activeGeneration);
  assert.equal(status.activeGeneration.coverage.unsupported, 1);
  assert.equal(status.stale, false);
  const activeId = status.activeGeneration.id;
  const text = JSON.stringify(status);
  assert.ok(!text.includes("synthetic-embedding-key"));
  assert.ok(!text.includes("ciphertext"));
  const found = await retrieval.retrieveRag({
    user: owner,
    projectId: "dash-p1",
    prompt: "REQ-0304 자료를 설명해줘",
    checkpoint,
    track: async () => {},
  });
  assert.ok(found.references.some((ref) => ref.sourceId === "rag-0304"));
  await retrieval.validateRagEvidence(owner, "dash-p1", found);
  const fallbackFound = await retrieval.retrieveRag({
    user: owner,
    projectId: "dash-p1",
    prompt: "REQ-0304 자료를 설명해줘",
    checkpoint,
    track: async () => {},
    nativeSearch: false,
  });
  assert.ok(
    fallbackFound.references.some((ref) => ref.sourceId === "rag-0304"),
    "portable exact search also covers final source",
  );
  await client.execute(
    "UPDATE project_artifacts SET version=version+1 WHERE id='rag-0304'",
  );
  assert.equal((await rag.ragSummary(owner, "dash-p1")).stale, true);
  assert.equal(
    (
      await retrieval.retrieveRag({
        user: owner,
        projectId: "dash-p1",
        prompt: "변경 자료",
        checkpoint,
        track: async () => {},
      })
    ).fallbackCode,
    "INDEX_STALE",
  );
  await assert.rejects(() =>
    retrieval.validateRagEvidence(owner, "dash-p1", found),
  );
  await rag.startRagJob(owner, "dash-p1", input(1, "index-second"));
  const before = calls;
  await (await worker.processNextRagJob()).run();
  status = await rag.ragSummary(owner, "dash-p1");
  assert.equal(status.latestJob.status, "completed");
  assert.notEqual(status.activeGeneration.id, activeId);
  assert.ok(calls - before < 5, "unchanged vectors reused");
  const secondId = status.activeGeneration.id;
  await rag.startRagJob(owner, "dash-p1", input(2, "index-cancel"));
  await rag.stopRagJob(
    owner,
    "dash-p1",
    (await rag.ragSummary(owner, "dash-p1")).latestJob.id,
  );
  await (await worker.processNextRagJob()).run();
  status = await rag.ragSummary(owner, "dash-p1");
  assert.equal(status.latestJob.status, "cancelled");
  assert.equal(status.activeGeneration.id, secondId);
  await client.execute(
    "UPDATE project_artifacts SET version=version+1 WHERE id='rag-0304'",
  );
  await rag.startRagJob(owner, "dash-p1", input(3, "index-fail"));
  failure = true;
  await (await worker.processNextRagJob()).run();
  failure = false;
  status = await rag.ragSummary(owner, "dash-p1");
  assert.equal(status.latestJob.status, "failed");
  assert.equal(status.activeGeneration.id, secondId);
  await rag.startRagJob(owner, "dash-p1", input(4, "index-stale"));
  onEmbedding = () =>
    client.execute(
      "UPDATE project_artifacts SET version=version+1 WHERE id='rag-0304'",
    );
  await (await worker.processNextRagJob()).run();
  status = await rag.ragSummary(owner, "dash-p1");
  assert.equal(status.latestJob.status, "failed");
  assert.equal(status.latestJob.errorCode, "RAG_409");
  assert.equal(status.activeGeneration.id, secondId);
  const recovery = await rag.startRagJob(
    owner,
    "dash-p1",
    input(5, "index-recovery"),
  );
  onEmbedding = () =>
    client.execute({
      sql: "UPDATE project_rag_jobs SET lease_token='expired-owner',lease_until='2000-01-01T00:00:00.000Z' WHERE id=?",
      args: [recovery.id],
    });
  const expired = await worker.processNextRagJob();
  await expired.run();
  assert.equal(
    (await rag.ragSummary(owner, "dash-p1")).latestJob.status,
    "running",
  );
  await (await worker.processNextRagJob()).run();
  status = await rag.ragSummary(owner, "dash-p1");
  assert.equal(status.latestJob.status, "completed");
  const recoveredId = status.activeGeneration.id;
  await expired.run();
  assert.equal(
    (await rag.ragSummary(owner, "dash-p1")).activeGeneration.id,
    recoveredId,
    "expired worker cannot republish",
  );
  assert.equal(
    Number(
      (
        await client.execute({
          sql: "SELECT attempt FROM project_rag_jobs WHERE id=?",
          args: [recovery.id],
        })
      ).rows[0].attempt,
    ),
    2,
  );
  // A large source fails after its first persisted batch, before a second batch.
  const stamp2 = new Date().toISOString();
  await client.execute({
    sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES ('resume-long','dash-ws','dash-p2','requirement','RESUME-001','Long checkpoint source','초안',?,'{}',1,'dash-owner','dash-owner',?,?)",
    args: [
      JSON.stringify({
        definition: Array.from(
          { length: 8000 },
          (_, i) => `checkpoint ${String(i).padStart(5, "0")} `,
        ).join(""),
      }),
      stamp2,
      stamp2,
    ],
  });
  const partial = await rag.startRagJob(
    owner,
    "dash-p2",
    input(0, "partial-first"),
  );
  failAtCall = calls + 3;
  await (await worker.processNextRagJob()).run();
  failAtCall = Infinity;
  const partialRow = (
    await client.execute({
      sql: "SELECT * FROM project_rag_jobs WHERE id=?",
      args: [partial.id],
    })
  ).rows[0];
  assert.equal(partialRow.status, "failed");
  assert.ok(Number(partialRow.completed_chunks) > 32);
  const storedChunks = (
    await client.execute({
      sql: "SELECT id,content_hash FROM project_rag_chunks WHERE generation_id=?",
      args: [partialRow.generation_id],
    })
  ).rows;
  const resumeInput = {
    expectedConfigVersion: 1,
    idempotencyKey: "partial-resume",
  };
  await assert.rejects(() =>
    resumeRagJob(viewer, "dash-p2", partial.id, resumeInput),
  );
  await assert.rejects(() =>
    resumeRagJob(owner, "dash-p1", partial.id, resumeInput),
  );
  await assert.rejects(() =>
    resumeRagJob(owner, "dash-p2", partial.id, {
      ...resumeInput,
      model: "text-embedding-other",
    }),
  );
  await client.execute(
    "UPDATE project_artifacts SET version=version+1 WHERE id='resume-long'",
  );
  await assert.rejects(
    () => resumeRagJob(owner, "dash-p2", partial.id, resumeInput),
    /원본이 변경/,
  );
  await client.execute(
    "UPDATE project_artifacts SET version=version-1 WHERE id='resume-long'",
  );
  const resumeRoute = load(
    resolve("app/api/projects/[projectId]/rag/jobs/[jobId]/resume/route.ts"),
  );
  const resumeResponse = await resumeRoute.POST(request(resumeInput), {
    params: Promise.resolve({ projectId: "dash-p2", jobId: partial.id }),
  });
  assert.equal(resumeResponse.status, 202, await resumeResponse.clone().text());
  const resumed = (await resumeResponse.json()).job;
  assert.equal(resumed.restartMode, "resume");
  assert.equal(resumed.resumedFromJobId, partial.id);
  assert.equal(resumed.completedChunks, Number(partialRow.completed_chunks));
  assert.equal(
    (await resumeRagJob(owner, "dash-p2", partial.id, resumeInput)).id,
    resumed.id,
  );
  await assert.rejects(() =>
    resumeRagJob(owner, "dash-p2", partial.id, {
      ...resumeInput,
      idempotencyKey: "partial-concurrent",
    }),
  );
  failAtCall = calls + 1;
  await (await worker.processNextRagJob()).run();
  failAtCall = Infinity;
  assert.equal(
    (await rag.readRagJob(owner, "dash-p2", resumed.id)).status,
    "failed",
  );
  const resumedAgain = await resumeRagJob(owner, "dash-p2", resumed.id, {
    expectedConfigVersion: 2,
    idempotencyKey: "partial-resume-again",
    apiKey: "synthetic-embedding-key",
  });
  const startInputs = embeddingInputs.length;
  await (await worker.processNextRagJob()).run();
  const newInputs = embeddingInputs.slice(startInputs),
    savedHashes = new Set(storedChunks.map((c) => c.content_hash));
  assert.ok(newInputs.length > 0);
  assert.ok(
    newInputs.every((text) => !savedHashes.has(ragHash(text))),
    "saved chunks are never sent to embeddings again",
  );
  const finalStatus = await rag.ragSummary(owner, "dash-p2");
  assert.equal(finalStatus.latestJob.status, "completed");
  assert.equal(
    finalStatus.activeGeneration.id,
    partialRow.generation_id,
    "resume retains the generation",
  );
  assert.equal(
    (await rag.readRagJob(owner, "dash-p2", partial.id)).status,
    "failed",
    "original failure retained",
  );
  assert.equal(
    (await rag.readRagJob(owner, "dash-p2", resumedAgain.id)).restartMode,
    "resume",
  );
  const afterChunks = (
    await client.execute({
      sql: "SELECT id FROM project_rag_chunks WHERE generation_id=?",
      args: [partialRow.generation_id],
    })
  ).rows;
  assert.ok(
    storedChunks.every((c) => afterChunks.some((a) => a.id === c.id)),
    "persisted chunk identities preserved",
  );
  const fresh = await rag.startRagJob(
    owner,
    "dash-p2",
    input(3, "partial-fresh"),
  );
  assert.equal(fresh.restartMode, "new");
  const freshRow = (
    await client.execute({
      sql: "SELECT generation_id FROM project_rag_jobs WHERE id=?",
      args: [fresh.id],
    })
  ).rows[0];
  assert.notEqual(
    freshRow.generation_id,
    partialRow.generation_id,
    "new starts a separate generation",
  );
  await rag.stopRagJob(owner, "dash-p2", fresh.id);
  await (await worker.processNextRagJob()).run();
  console.log(
    "PASS resume: real API, partial-batch checkpoints, no repeated saved inputs, repeated failure/resume, optional key replacement, history/lineage, new-vs-resume, stale source rejection, scope and idempotency.",
  );
  const usage = await client.execute(
    "SELECT COUNT(*) AS n FROM ai_token_usage WHERE purpose='embedding_index' AND usage_known=1 AND output_tokens=0 AND total_tokens=input_tokens",
  );
  assert.ok(Number(usage.rows[0].n) > 0);
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    `PASS: 300+ full sources, long RFP, file extraction/exclusions, model/key scope, roles, idempotency/concurrency, atomic publication, exact retrieval, stale evidence, vector reuse, cancellation, provider failure, mid-job source conflict, usage and FK integrity. Local native vectors: ${nativeVectors}.`,
  );
} finally {
  globalThis.fetch = originalFetch;
  client.close();
}
