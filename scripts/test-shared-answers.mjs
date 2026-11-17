// Real authenticated routes and temporary SQLite. Never loads .env or production data.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import { dashboardFixture } from "./dashboard-test-fixture.mjs";
const fixture = await dashboardFixture(),
  client = fixture.db;
const require = createRequire(import.meta.url),
  cache = new Map();
let token = "dash-owner-session",
  generationCalls = 0,
  toolName = "read_page",
  duringGeneration;
process.env.APP_URL = "http://localhost:3000";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Unexpected external call in isolated shared-answer test");
};
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => client };
  if (file === resolve("lib/ai-server.ts"))
    return {
      aiModels: async () => ["gpt-test"],
      generateAi: async (
        _model,
        _instructions,
        _prompt,
        agent,
        _images,
        _history,
        track,
      ) => {
        if (_instructions.startsWith("공유 답변 후보")) {
          await track({ turn: 0, status: "started", reservedTokens: 2 });
          await track({
            turn: 0,
            status: "completed",
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          });
          return JSON.stringify({
            ids: JSON.parse(_prompt)
              .candidates.map((c) => c.id)
              .slice(0, 5),
          });
        }
        if (!agent) return "요구사항 조건 설명";
        generationCalls++;
        await agent.execute(toolName, {});
        if (duringGeneration) {
          const fn = duringGeneration;
          duringGeneration = null;
          await fn();
        }
        return "지정된 검수 항목을 충족해야 합니다.\n등록한 문서의 조건을 확인하세요.";
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
const auth = load(resolve("lib/auth.ts")),
  shared = load(resolve("lib/ai/shared-answers.ts")),
  matching = load(resolve("lib/ai/shared-answer-matching.ts")),
  provenance = load(resolve("lib/ai/answer-provenance.ts"));
const chats = load(resolve("app/api/ai/chats/route.ts"));
const registration = load(
  resolve("app/api/projects/[projectId]/shared-answers/route.ts"),
);
const review = load(
  resolve(
    "app/api/projects/[projectId]/shared-answers/[answerId]/review/route.ts",
  ),
);
const revoke = load(
  resolve(
    "app/api/projects/[projectId]/shared-answers/[answerId]/revoke/route.ts",
  ),
);
const detail = load(
  resolve("app/api/projects/[projectId]/shared-answers/[answerId]/route.ts"),
);
const request = (data) =>
  new Request("http://localhost:3000/api/ai/chats", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
const params = (id) => ({
  params: Promise.resolve({
    projectId: "dash-p1",
    ...(id ? { answerId: id } : {}),
  }),
});
async function room(userId, projectId = "dash-p1") {
  const id = randomUUID();
  await client.execute({
    sql: "INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,target_page,target_version,title_source,created_at,updated_at) VALUES (?,'dash-ws',?,?, '공유 검증','requirement',1,'manual',?,?)",
    args: [
      id,
      userId,
      projectId,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  });
  return id;
}
async function ask(userId, prompt, extras = {}, convId) {
  const roomId = convId ?? (await room(userId));
  const response = await chats.POST(
    request({
      requestId: randomUUID(),
      projectId: "dash-p1",
      convId: roomId,
      prompt,
      model: "gpt-test",
      pathname: "/projects/dash-p1",
      tab: "requirement",
      targetPage: "requirement",
      expectedTargetVersion: 1,
      ...extras,
    }),
  );
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  return { ...data, roomId };
}
try {
  const owner = await auth.requireUser();
  const original = await ask("dash-owner", "REQ-001 승인 조건은?");
  assert.equal(
    original.chat.shareEligibility.eligible,
    true,
    JSON.stringify(original),
  );
  const before = generationCalls;
  const input = {
    chatId: original.chat.id,
    conditions:
      "REQ-001의 현재 등록 문서와 동일한 판, 승인 기준 설명에 한함. 최신 수치·개인별 결과 제외.",
    aliases: ["REQ-001이 승인되려면 어떤 조건이 필요한가?"],
    confirmPublic: true,
    idempotencyKey: randomUUID(),
  };
  const submitted = await registration.POST(request(input), params());
  assert.equal(submitted.status, 201, await submitted.clone().text());
  const { id } = await submitted.json();
  assert.equal((await registration.POST(request(input), params())).status, 201);
  assert.equal(
    (
      await registration.POST(
        request({ ...input, conditions: "다른 조건" }),
        params(),
      )
    ).status,
    409,
  );
  assert.equal(
    (await shared.getSharedAnswer(owner, "dash-p1", id)).status,
    "pending_review",
  );
  assert.equal(
    (await shared.findSharedAnswers(owner, "dash-p1", original.chat.prompt))
      .exact,
    null,
  );
  token = "dash-viewer-session";
  const viewer = await auth.requireUser();
  assert.equal(
    (await detail.GET(new Request("http://localhost:3000/"), params(id)))
      .status,
    404,
  );
  assert.equal(
    (
      await review.POST(
        request({
          expectedVersion: 1,
          decision: "approve",
          confirmPublic: true,
          confirmConditions: true,
        }),
        params(id),
      )
    ).status,
    404,
  );
  assert.equal((await registration.POST(request(input), params())).status, 403);
  token = "dash-owner-session";
  assert.equal(
    (
      await review.POST(
        request({
          expectedVersion: 1,
          decision: "approve",
          confirmPublic: true,
          confirmConditions: true,
        }),
        params(id),
      )
    ).status,
    200,
  );
  token = "dash-viewer-session";
  const reused = await ask(
    "dash-viewer",
    "REQ-001이 승인되려면 어떤 조건이 필요한가?",
  );
  assert.equal(reused.chat.responseSource, "shared_answer");
  assert.equal(reused.chat.result, original.chat.result);
  assert.equal(generationCalls, before);
  assert.deepEqual(reused.actions, []);
  const stored = (
    await client.execute({
      sql: "SELECT result,shared_answer_id FROM ai_prompt_chats WHERE id=?",
      args: [reused.chat.id],
    })
  ).rows[0];
  assert.equal(stored.result, original.chat.result);
  assert.equal(stored.shared_answer_id, id);
  const suggested = await ask("dash-viewer", "REQ-001 승인 조건 설명");
  assert.equal(suggested.kind, "shared_candidates");
  assert.equal(
    (
      await client.execute(
        "SELECT count(*) AS n FROM ai_token_usage WHERE purpose='orchestration' AND call_index=2500 AND usage_known=1",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(suggested.chat, undefined);
  assert.equal(generationCalls, before);
  assert.equal(
    (
      await client.execute({
        sql: "SELECT request_id FROM ai_conversations WHERE conv_id=?",
        args: [suggested.roomId],
      })
    ).rows[0].request_id,
    null,
  );
  assert.equal(
    (
      await client.execute({
        sql: "SELECT count(*) AS n FROM ai_prompt_chats WHERE conv_id=?",
        args: [suggested.roomId],
      })
    ).rows[0].n,
    0,
  );
  assert.equal(
    (await detail.GET(new Request("http://localhost:3000/"), params(id)))
      .status,
    200,
  );
  const fresh = await ask(
    "dash-viewer",
    "REQ-001 승인 조건 설명",
    { sharedMode: "generate_fresh" },
    suggested.roomId,
  );
  assert.equal(fresh.chat.responseSource, "generated");
  assert.equal(generationCalls, before + 1);
  await assert.rejects(
    () =>
      shared.validateSharedSelection(
        viewer,
        "dash-p1",
        suggested.roomId,
        1,
        "다른 질문",
        { selectionToken: suggested.selectionToken, sharedAnswerId: id },
      ),
    /만료|변경/,
  );
  await assert.rejects(
    () =>
      shared.validateSharedSelection(
        viewer,
        "dash-p1",
        suggested.roomId,
        1,
        "REQ-001 승인 조건 설명",
        { selectionToken: suggested.selectionToken, sharedAnswerId: id },
      ),
    /열람만/,
  );
  assert.equal(
    (await shared.findSharedAnswers(viewer, "dash-p1", "REQ-002 승인 조건은?"))
      .candidates.length,
    0,
  );
  assert.equal(
    (await shared.findSharedAnswers(owner, "dash-p2", original.chat.prompt))
      .exact,
    null,
  );
  await assert.rejects(() =>
    shared.findSharedAnswers(viewer, "dash-hidden", original.chat.prompt),
  );
  assert.ok(matching.questionExclusion("현재 진행률"));
  assert.ok(matching.questionExclusion("지난주 진행률"));
  assert.ok(matching.questionExclusion("내 담당 항목 설명"));
  assert.ok(matching.questionExclusion("그 문서 설명"));
  assert.ok(matching.questionExclusion("REQ-001을 삭제해줘"));
  assert.equal(
    matching.compatibleSharedQuestion(
      "개발 단계 전체 기준",
      "개발 단계 미완료 기준",
    ),
    false,
  );
  assert.equal(
    matching.compatibleSharedQuestion(
      "REQ-001 영어 표로",
      "REQ-001 한국어 설명",
    ),
    false,
  );
  assert.equal(
    matching.compatibleSharedQuestion("REQ-001 A팀 범위", "REQ-001 B팀 범위"),
    false,
  );
  token = "dash-owner-session";
  const followup = await ask(
    "dash-owner",
    "REQ-001 범위를 설명해줘",
    { sharedMode: "generate_fresh" },
    original.roomId,
  );
  assert.equal(followup.chat.shareEligibility.eligible, false);
  const privateInput = await provenance.captureAnswerProvenance(
    owner,
    "dash-p1",
    "requirement",
    original.chat.prompt,
    true,
  );
  assert.equal(privateInput.provenance.complete, false);
  const unknown = await provenance.captureAnswerProvenance(
    owner,
    "dash-p1",
    "requirement",
    original.chat.prompt,
    false,
  );
  unknown.observe("unknown_read", {}, {});
  assert.equal(unknown.provenance.complete, false);
  const partial = await provenance.captureAnswerProvenance(
    owner,
    "dash-p1",
    "requirement",
    original.chat.prompt,
    false,
  );
  partial.observe("read_page", {}, { data: { truncated: true } });
  assert.equal(partial.provenance.complete, false);
  const clockSensitive = await provenance.captureAnswerProvenance(
    owner,
    "dash-p1",
    "requirement",
    original.chat.prompt,
    false,
  );
  assert.equal(
    clockSensitive.finish("이번주에 완료됩니다.", false).complete,
    false,
  );
  const unsafe = await provenance.captureAnswerProvenance(
    owner,
    "dash-p1",
    "requirement",
    original.chat.prompt,
    false,
  );
  assert.equal(
    unsafe.finish("Contact person@example.test", false).complete,
    false,
  );
  duringGeneration = async () =>
    client.execute(
      "UPDATE projects SET description='Changed during generation' WHERE id='dash-p1'",
    );
  const raced = await ask("dash-owner", "REQ-001 상세 범위 설명", {
    sharedMode: "generate_fresh",
  });
  assert.equal(raced.chat.shareEligibility.eligible, false);
  assert.equal(
    (await shared.findSharedAnswers(viewer, "dash-p1", original.chat.prompt))
      .exact,
    null,
  );
  assert.equal(
    (await shared.listSharedAnswers(owner, "dash-p1")).answers.find(
      (a) => a.id === id,
    ).status,
    "needs_review",
  );
  assert.equal(
    (await shared.sharedHistoryOrigin(viewer, "dash-p1", id, 1)).stale,
    true,
  );
  assert.equal(
    (await detail.GET(new Request("http://localhost:3000/"), params(id)))
      .status,
    200,
  ); // owner may inspect stale evidence
  const replacementChat = await ask("dash-owner", original.chat.prompt, {
    sharedMode: "generate_fresh",
  });
  assert.equal(replacementChat.chat.shareEligibility.eligible, true);
  const replacementInput = {
    ...input,
    chatId: replacementChat.chat.id,
    replaceAnswerId: id,
    expectedVersion: 2,
    idempotencyKey: randomUUID(),
  };
  assert.equal(
    (await registration.POST(request(replacementInput), params())).status,
    201,
  );
  assert.equal(
    (await registration.POST(request(replacementInput), params())).status,
    201,
  );
  const replacement = await shared.getSharedAnswer(owner, "dash-p1", id);
  assert.equal(replacement.answerVersion, 2);
  assert.equal(replacement.version, 3);
  assert.equal(replacement.status, "pending_review");
  assert.equal(
    (
      await client.execute({
        sql: "SELECT count(*) AS n FROM project_shared_answer_versions WHERE answer_id=?",
        args: [id],
      })
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await review.POST(
        request({
          expectedVersion: 3,
          decision: "approve",
          confirmPublic: true,
          confirmConditions: true,
        }),
        params(id),
      )
    ).status,
    200,
  );
  assert.equal(
    (await shared.findSharedAnswers(viewer, "dash-p1", original.chat.prompt))
      .exact.answerVersion,
    2,
  );
  const pending = await shared.getSharedAnswer(owner, "dash-p1", id);
  assert.equal(
    (
      await revoke.POST(
        request({ expectedVersion: pending.version }),
        params(id),
      )
    ).status,
    200,
  );
  assert.equal(
    (await shared.sharedHistoryOrigin(viewer, "dash-p1", id, 1)).unavailable,
    true,
  );
  token = "dash-viewer-session";
  const history = await chats.GET(
    new Request(
      `http://localhost:3000/api/ai/chats?projectId=dash-p1&convId=${reused.roomId}`,
    ),
  );
  assert.equal(history.status, 200);
  const historic = await history.json();
  assert.equal(historic.chats[0].sharedAnswer.unavailable, true);
  assert.notEqual(historic.chats[0].result, original.chat.result);
  token = "dash-outsider-session";
  assert.equal(
    (await detail.GET(new Request("http://localhost:3000/"), params(id)))
      .status,
    404,
  );
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      client.execute({
        sql: "UPDATE project_shared_answer_versions SET answer_text='tampered' WHERE answer_id=?",
        args: [id],
      }),
    /immutable/,
  );
  console.log(
    "Shared answers: authenticated registration/approval, reviewed aliases, verbatim reuse without generation/tools, candidate/fresh flow, scope, privacy, provenance, invalidation, revocation, history protection, idempotency and FK checks passed.",
  );
} finally {
  globalThis.fetch = originalFetch;
  client.close();
}
