import assert from "node:assert/strict";
export async function checkAiTokenUsage({
  request,
  client,
  cookie,
  other,
  project,
  base,
  makeRoom,
}) {
  await client.execute("DELETE FROM auth_rate_limits");
  const room = await makeRoom(project.id);
  const post = (prompt) =>
    request("/api/ai/chats", {
      cookie,
      method: "POST",
      data: { ...base, convId: room.convId, prompt },
    });
  const records = async () =>
    (
      await client.execute({
        sql: "SELECT * FROM ai_token_usage WHERE conv_id=? ORDER BY created_at,call_index",
        args: [room.convId],
      })
    ).rows;
  let response = await post("실제 토큰 수집 검증");
  assert.equal(response.status, 200, await response.clone().text());
  let rows = await records();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].input_tokens, 100);
  assert.equal(rows[0].output_tokens, 40);
  assert.equal(rows[0].total_tokens, 140);
  assert.equal(rows[0].cached_tokens, 20);
  assert.equal(rows[0].reasoning_tokens, 10);
  assert.equal(rows[0].chat_saved, 1);
  assert.ok(rows[0].result_characters > 0);
  assert.ok(rows[0].prompt_characters > 0);
  const spec = Buffer.from(
    JSON.stringify({ name: "read_page", args: {} }),
  ).toString("base64");
  response = await post(`조회해줘 [TOOL]${spec}`);
  assert.equal(response.status, 200);
  rows = await records();
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.slice(1).map((row) => row.call_index),
    [0, 1],
  );
  assert.equal(rows[1].request_id, rows[2].request_id);
  assert.equal((await post("[INCOMPLETE]")).status, 502);
  assert.equal((await post("[FAIL]")).status, 429);
  assert.equal((await post("[NO_USAGE]")).status, 200);
  assert.equal((await post("[BAD_USAGE]")).status, 200);
  assert.equal((await post("[NETWORK_FAIL]")).status, 504);
  assert.equal((await post("[BROKEN_JSON]")).status, 502);
  assert.equal((await post("[DUPLICATE_USAGE] once")).status, 200);
  assert.equal((await post("[DUPLICATE_USAGE] twice")).status, 200);
  rows = await records();
  assert.equal(rows.filter((row) => row.status === "duplicate").length, 1);
  assert.equal(rows.find((row) => row.status === "incomplete").usage_known, 1);
  assert.ok(
    rows
      .filter((row) => !row.usage_known)
      .every((row) => row.input_tokens === null && row.total_tokens === null),
  );
  const first = rows[0];
  await client.execute({
    sql: "UPDATE ai_token_usage SET created_at='2025-12-31T15:00:00.000Z' WHERE id=?",
    args: [first.id],
  });
  const endpoint = `/api/ai/usage?from=2026-01-01&to=2026-01-31&group=daily&projectId=${project.id}&convId=${room.convId}`;
  response = await request(endpoint, { cookie });
  assert.equal(response.status, 200);
  const stats = await response.json();
  assert.equal(stats.timezone, "Asia/Seoul");
  assert.equal(stats.totals.input, 100);
  assert.equal(stats.totals.output, 40);
  assert.equal(stats.totals.total, 140);
  assert.equal(stats.series.length, 31);
  assert.equal(stats.series[0].total, 140);
  assert.equal(stats.series[1].total, 0);
  const weekdays = await (
    await request(endpoint.replace("group=daily", "group=weekday"), { cookie })
  ).json();
  assert.equal(weekdays.series.length, 7);
  assert.equal(weekdays.series.find((row) => row.label === "목").total, 140);
  const months = await (
    await request(
      endpoint
        .replace("2026-01-31", "2026-12-31")
        .replace("group=daily", "group=monthly"),
      { cookie },
    )
  ).json();
  assert.equal(months.series.length, 12);
  assert.equal(months.series[0].total, 140);
  assert.equal((await request(endpoint)).status, 401);
  const privateStats = await (
    await request(endpoint, { cookie: other.cookie })
  ).json();
  assert.equal(privateStats.totals.calls, 0);
  assert.ok(
    !privateStats.conversations.some((item) => item.id === room.convId),
  );
  for (const suffix of [
    "from=2026-02-30&to=2026-03-01",
    "from=2026-03-01&to=2026-02-01",
    "from=2020-01-01&to=2026-01-01",
    "from=2026-01-01&to=2026-01-31&group=invalid",
  ]) {
    assert.equal(
      (await request(`/api/ai/usage?${suffix}`, { cookie })).status,
      400,
    );
  }
  await client.execute({
    sql: "UPDATE ai_token_usage SET created_at='2025-12-31T14:59:59.999Z' WHERE id=?",
    args: [first.id],
  });
  assert.equal(
    (await (await request(endpoint, { cookie })).json()).totals.total,
    0,
  );
  await client.execute({
    sql: "UPDATE ai_token_usage SET created_at='2025-12-31T15:00:00.000Z' WHERE id=?",
    args: [first.id],
  });
  const removed = await request(`/api/ai/conversations/${room.convId}`, {
    cookie,
    method: "DELETE",
    data: { projectId: project.id },
  });
  assert.equal(removed.status, 200);
  assert.equal((await records()).length, rows.length);
  const after = await (await request(endpoint, { cookie })).json();
  assert.equal(after.totals.total, 140);
  assert.equal(
    after.conversations.find((item) => item.id === room.convId).deleted,
    true,
  );
  console.log(
    "PASS: actual per-call tokens, tool-round aggregation, missing/invalid/error/incomplete usage, response deduplication, Korean date boundaries, zero-filled monthly/weekday/daily charts, privacy, validated filters and retention after deletion.",
  );
}
