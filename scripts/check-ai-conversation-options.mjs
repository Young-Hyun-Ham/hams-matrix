import assert from "node:assert/strict";

export async function checkAiConversationOptions({
  request,
  client,
  cookie,
  other,
  project,
  base,
  makeRoom,
}) {
  await client.execute("DELETE FROM auth_rate_limits");
  const first = await makeRoom(project.id),
    second = await makeRoom(project.id);
  assert.equal(first.isPinned, false);
  const endpoint = (room) => `/api/ai/conversations/${room.convId}`;
  const patch = (room, data, session = cookie) =>
    request(endpoint(room), {
      cookie: session,
      method: "PATCH",
      data: { projectId: project.id, ...data },
    });
  const remove = (room, options = {}) =>
    request(endpoint(room), {
      cookie,
      method: "DELETE",
      data: { projectId: project.id },
      ...options,
    });
  const list = async () =>
    (
      await (
        await request(`/api/ai/conversations?projectId=${project.id}`, {
          cookie,
        })
      ).json()
    ).conversations;
  assert.equal((await patch(first, { isPinned: "true" })).status, 400);
  assert.equal((await patch(first, {})).status, 400);
  assert.equal(
    (await patch(first, { isPinned: true }, other.cookie)).status,
    404,
  );
  assert.equal((await remove(first, { cookie: other.cookie })).status, 404);
  assert.equal((await remove(first, { cookie: undefined })).status, 401);
  assert.equal(
    (await remove(first, { requestOrigin: "https://invalid.example" })).status,
    403,
  );
  assert.equal((await remove(first, { data: { projectId: "" } })).status, 404);
  await client.execute({
    sql: "UPDATE ai_conversations SET updated_at='2020-01-01T00:00:00.000Z' WHERE conv_id=?",
    args: [first.convId],
  });
  await client.execute({
    sql: "UPDATE ai_conversations SET updated_at='2021-01-01T00:00:00.000Z' WHERE conv_id=?",
    args: [second.convId],
  });
  const pinned = await patch(first, { isPinned: true });
  assert.equal(pinned.status, 200);
  assert.equal(
    (await pinned.json()).conversation.updatedAt,
    "2020-01-01T00:00:00.000Z",
  );
  assert.equal((await patch(second, { isPinned: true })).status, 200);
  assert.deepEqual(
    (await list()).slice(0, 2).map((room) => room.convId),
    [second.convId, first.convId],
  );
  assert.equal((await patch(second, { isPinned: false })).status, 200);
  assert.equal((await list())[0].convId, first.convId);
  const renamed = await patch(first, { title: "고정된 채팅 제목" });
  assert.equal(renamed.status, 200);
  const renamedRoom = (await renamed.json()).conversation;
  assert.equal(renamedRoom.isPinned, true);
  assert.equal(renamedRoom.title, "고정된 채팅 제목");
  assert.equal(
    (await patch(first, { title: "제목과 고정 동시 수정", isPinned: false }))
      .status,
    200,
  );
  assert.equal(
    (await list()).find((room) => room.convId === first.convId).isPinned,
    false,
  );
  const target = await makeRoom(project.id);
  const generated = await request("/api/ai/chats", {
    cookie,
    method: "POST",
    data: {
      ...base,
      convId: target.convId,
      prompt: "삭제 검증 캡처",
      images: [
        {
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQIoAAAAASUVORK5CYII=",
        },
      ],
    },
  });
  assert.equal(generated.status, 200, await generated.clone().text());
  const chat = (await generated.json()).chat;
  const imageCount = async () =>
    Number(
      (
        await client.execute({
          sql: "SELECT count(*) AS n FROM ai_chat_images WHERE chat_id=?",
          args: [chat.id],
        })
      ).rows[0].n,
    );
  assert.equal(await imageCount(), 1);
  await client.execute(
    "CREATE TRIGGER test_room_delete_failure BEFORE DELETE ON ai_conversations BEGIN SELECT RAISE(ABORT,'test delete rollback'); END",
  );
  assert.equal((await remove(target)).status, 500);
  await client.execute("DROP TRIGGER test_room_delete_failure");
  assert.equal(await imageCount(), 1);
  assert.equal(
    (
      await request(
        `/api/ai/chats?projectId=${project.id}&convId=${target.convId}`,
        { cookie },
      )
    ).status,
    200,
  );
  await client.execute({
    sql: "UPDATE ai_conversations SET request_id='running',busy_until=? WHERE conv_id=?",
    args: [new Date(Date.now() + 60000).toISOString(), target.convId],
  });
  assert.equal((await remove(target)).status, 409);
  assert.equal(await imageCount(), 1);
  await client.execute({
    sql: "UPDATE ai_conversations SET busy_until='2000-01-01T00:00:00.000Z' WHERE conv_id=?",
    args: [target.convId],
  });
  const before = await list();
  assert.equal((await remove(target)).status, 200);
  assert.equal(await imageCount(), 0);
  assert.equal(
    (
      await client.execute({
        sql: "SELECT id FROM ai_prompt_chats WHERE conv_id=?",
        args: [target.convId],
      })
    ).rows.length,
    0,
  );
  assert.equal((await request(chat.images[0].url, { cookie })).status, 404);
  assert.equal(
    (
      await request(
        `/api/ai/chats?projectId=${project.id}&convId=${target.convId}`,
        { cookie },
      )
    ).status,
    404,
  );
  assert.equal((await remove(target)).status, 404);
  assert.deepEqual(
    (await list()).map((room) => room.convId),
    before
      .filter((room) => room.convId !== target.convId)
      .map((room) => room.convId),
  );
  console.log(
    "PASS: persistent pin/unpin ordering, rename preserves pin, scoped access and origin checks, busy-room protection, atomic delete/rollback of room/messages/images and isolation of other rooms.",
  );
}
