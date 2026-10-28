import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function checkAiCancellation({ request, client, cookie, other, project, base, makeRoom }) {
  await client.execute("DELETE FROM auth_rate_limits");
  const room = await makeRoom(project.id);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const records = async id => (await client.execute({ sql: "SELECT * FROM ai_token_usage WHERE request_id=? ORDER BY call_index", args: [id] })).rows;
  const until = async predicate => {
    for (let attempt = 0; attempt < 300; attempt++) {
      const value = await predicate();
      if (value) return value;
      await pause(100);
    }
    throw Error("Timed out waiting for background generation");
  };
  const generate = (requestId, prompt) => request("/api/ai/chats", {
    cookie, method: "POST", data: { ...base, convId: room.convId, requestId, prompt },
  });
  const stop = (requestId, options = {}) => request("/api/ai/chats/stop", {
    cookie, method: "POST", data: { requestId, convId: room.convId, projectId: project.id }, ...options,
  });
  const usage = (id, auth = cookie) => request(`/api/ai/chats/usage?requestId=${id}`, { cookie: auth });
  const id = randomUUID();
  const pending = generate(id, "[SLOW] 생성 중 사용량");
  await until(async () => (await records(id))[0]?.usage_known === 1);
  let row = (await records(id))[0];
  assert.equal(row.input_tokens, 100);
  assert.ok(row.output_tokens >= 10 && row.output_tokens <= 20);
  assert.equal(row.finished_at, null);
  assert.equal((await (await usage(id, other.cookie)).json()).calls, 0);
  assert.equal((await usage(id, "")).status, 401);
  assert.equal((await stop(id, { cookie: other.cookie })).status, 404);
  assert.equal((await stop(id, { requestOrigin: "https://evil.example" })).status, 403);
  assert.equal((await stop(id)).status, 200);
  assert.equal((await (await pending).json()).cancelled, true);
  row = (await records(id))[0];
  assert.equal(row.status, "cancelled");
  assert.equal(row.output_tokens, 25);
  assert.equal(row.total_tokens, 125);
  assert.equal(row.chat_saved, 0);
  assert.equal(row.usage_final, 1);
  assert.ok(row.finished_at);
  assert.equal((await stop(id)).status, 200, "repeated stop is idempotent");
  assert.equal((await (await usage(id)).json()).total, 125);
  assert.equal((await generate(randomUUID(), "중지 후 재생성")).status, 200);

  const early = randomUUID();
  assert.equal((await stop(early)).status, 200);
  assert.equal((await (await generate(early, "먼저 도착한 중지")).json()).cancelled, true);
  assert.equal((await records(early)).length, 0, "early stop must not make a paid call");

  const unknown = randomUUID();
  const unknownPending = generate(unknown, "[SLOW] [NO_LIVE_USAGE]");
  await until(async () => (await records(unknown))[0]?.response_id);
  await stop(unknown);
  assert.equal((await (await unknownPending).json()).cancelled, true);
  row = (await records(unknown))[0];
  assert.equal(row.usage_known, 0);
  assert.equal(row.input_tokens, null);
  assert.equal(row.output_tokens, null);

  const snapshotOnly = randomUUID();
  const snapshotPending = generate(snapshotOnly, "[SLOW] [NO_CANCEL_USAGE]");
  await until(async () => (await records(snapshotOnly))[0]?.usage_known === 1);
  await stop(snapshotOnly);
  assert.equal((await (await snapshotPending).json()).cancelled, true);
  row = (await records(snapshotOnly))[0];
  assert.equal(row.input_tokens, 100, "missing final usage cannot erase a measured snapshot");
  assert.ok(row.output_tokens >= 10);
  assert.equal(row.usage_final, 0, "interim usage must remain distinguishable from final usage");

  const complete = randomUUID();
  assert.equal((await generate(complete, "[SLOW] [COMPLETE]")).status, 200);
  assert.equal((await records(complete))[0].total_tokens, 140);
  assert.equal((await stop(complete)).status, 200, "stop after completion cannot alter result");
  assert.equal((await records(complete))[0].status, "completed");

  const failed = randomUUID();
  const failedPending = generate(failed, "[SLOW] [CANCEL_FAIL]");
  await until(async () => (await records(failed))[0]?.response_id);
  assert.equal((await stop(failed)).status, 502);
  const failedResponse = await failedPending;
  assert.equal(failedResponse.status, 502);
  assert.equal((await failedResponse.json()).stopUnconfirmed, true);
  assert.equal((await (await stop(failed)).json()).settled, true);
  assert.equal((await records(failed))[0].status, "cancelled");

  const committed = randomUUID();
  const spec = Buffer.from(JSON.stringify({ name: "save_artifact", args: { action: "CREATE", title: "중지 전 저장된 화면", fields: { definition: "중지 검증", details: "반영된 작업 유지" } } })).toString("base64");
  const committedPending = generate(committed, `화면 등록해줘 [SLOW] [TOOL]${spec}`);
  await until(async () => (await records(committed))[1]?.response_id);
  await stop(committed);
  const result = await (await committedPending).json();
  assert.equal(result.cancelled, true);
  assert.equal(result.actions.length, 0, "staged changes must not commit after cancellation");
  const saved = (await client.execute({ sql: "SELECT actions_json FROM ai_generation_requests WHERE request_id=?", args: [committed] })).rows[0];
  assert.equal(JSON.parse(saved.actions_json).length, 0);
  assert.equal((await client.execute("SELECT id FROM project_artifacts WHERE title='중지 전 저장된 화면'")).rows.length, 0);
  assert.equal((await records(committed)).length, 2, "no further AI calls after cancellation");
  console.log("PASS: live token snapshots, provider cancellation/final usage, unknown usage, early/repeated/late stop, permissions, cancel failure/retry, staged-change discard, and regeneration.");
}
