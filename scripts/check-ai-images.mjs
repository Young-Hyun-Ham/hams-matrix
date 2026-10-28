import assert from "node:assert/strict";
import { temporaryProjectViewer } from "./test-project-role.mjs";
export async function checkAiImages({
  request,
  client,
  cookie,
  owner,
  other,
  project,
  base,
}) {
  await client.execute("DELETE FROM auth_rate_limits");
  const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQIoAAAAASUVORK5CYII=",
    dataUrl = `data:image/png;base64,${png}`;
  const post = (data) =>
    request("/api/ai/chats", {
      cookie,
      method: "POST",
      data: { ...base, ...data },
    });
  const generated = await post({
    prompt: "캡처 화면을 분석해줘",
    images: [{ dataUrl }],
  });
  assert.equal(generated.status, 200, await generated.clone().text());
  const { chat } = await generated.json();
  assert.equal(chat.images.length, 1);
  assert.equal(chat.images[0].width, 1);
  assert.equal(chat.images[0].height, 1);
  const ai = JSON.parse(chat.result);
  assert.equal(ai.imageCount, 1);
  assert.deepEqual(ai.imageTypes, ["data:image/png"]);
  assert.equal(ai.store, false);
  assert.ok(!JSON.stringify(chat).includes(png));
  const stored = (
    await client.execute({
      sql: "SELECT * FROM ai_chat_images WHERE chat_id=?",
      args: [chat.id],
    })
  ).rows[0];
  assert.ok(stored.ciphertext_base64 !== png);
  assert.ok(!JSON.stringify(stored).includes(png));
  assert.equal(Buffer.from(stored.iv_base64, "base64").length, 12);
  assert.equal(Buffer.from(stored.tag_base64, "base64").length, 16);
  assert.equal(stored.encryption_version, 1);
  const imageUrl = chat.images[0].url;
  assert.equal((await request(imageUrl)).status, 401);
  assert.equal((await request(imageUrl, { cookie: other.cookie })).status, 404);
  const image = await request(imageUrl, { cookie });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.ok(image.headers.get("cache-control").includes("no-store"));
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.equal(Buffer.from(await image.arrayBuffer()).toString("base64"), png);
  const history = await (
    await request(
      `/api/ai/chats?projectId=${project.id}&convId=${base.convId}`,
      { cookie },
    )
  ).json();
  const entry = history.chats.find((item) => item.id === chat.id);
  assert.deepEqual(entry.images, chat.images);
  assert.ok(!JSON.stringify(history).includes("ciphertext_base64"));
  assert.ok(!JSON.stringify(history).includes(png));
  const second = await post({ prompt: "", images: [{ dataUrl }, { dataUrl }] });
  assert.equal(second.status, 200);
  const secondChat = (await second.json()).chat;
  assert.equal(secondChat.images.length, 2);
  assert.ok(secondChat.prompt.includes("첨부한 캡처"));
  const ciphertexts = await client.execute({
    sql: "SELECT ciphertext_base64,iv_base64 FROM ai_chat_images WHERE chat_id=? ORDER BY position",
    args: [secondChat.id],
  });
  assert.notEqual(
    ciphertexts.rows[0].ciphertext_base64,
    ciphertexts.rows[1].ciphertext_base64,
  );
  assert.notEqual(ciphertexts.rows[0].iv_base64, ciphertexts.rows[1].iv_base64);
  const bad = Buffer.from(png, "base64");
  bad.writeUInt32BE(5000, 16);
  for (const images of [
    [{ dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }],
    [{ dataUrl: "data:image/png;base64,AAAA" }],
    [{ dataUrl: `data:image/png;base64,${bad.toString("base64")}` }],
    [{ dataUrl: "https://invalid.example/private.png" }],
    Array.from({ length: 6 }, () => ({ dataUrl })),
  ])
    assert.equal((await post({ images })).status, 400);
  const oversized = `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString("base64")}`;
  assert.equal((await post({ images: [{ dataUrl: oversized }] })).status, 400);
  const corrupted = Buffer.from(stored.ciphertext_base64, "base64");
  corrupted[0] ^= 1;
  await client.execute({
    sql: "UPDATE ai_chat_images SET ciphertext_base64=? WHERE id=?",
    args: [corrupted.toString("base64"), stored.id],
  });
  assert.equal((await request(imageUrl, { cookie })).status, 500);
  await client.execute({
    sql: "UPDATE ai_chat_images SET ciphertext_base64=?,width=2 WHERE id=?",
    args: [stored.ciphertext_base64, stored.id],
  });
  assert.equal((await request(imageUrl, { cookie })).status, 500);
  await client.execute({
    sql: "UPDATE ai_chat_images SET width=1 WHERE id=?",
    args: [stored.id],
  });
  assert.equal((await request(imageUrl, { cookie })).status, 200);
  const existingImages = Number(
    (await client.execute("SELECT COUNT(*) AS n FROM ai_chat_images")).rows[0]
      .n,
  );
  await client.execute(
    "CREATE TRIGGER test_image_save_failure BEFORE INSERT ON ai_chat_images BEGIN SELECT RAISE(ABORT,'test image save failure'); END",
  );
  const failure = await post({
    prompt: "암호화 저장 롤백 검증",
    images: [{ dataUrl }],
  });
  assert.equal(failure.status, 500);
  await client.execute("DROP TRIGGER test_image_save_failure");
  assert.equal(
    Number(
      (await client.execute("SELECT COUNT(*) AS n FROM ai_chat_images")).rows[0]
        .n,
    ),
    existingImages,
  );
  assert.equal(
    (
      await client.execute(
        "SELECT id FROM ai_prompt_chats WHERE prompt='암호화 저장 롤백 검증'",
      )
    ).rows.length,
    0,
  );
  const restoreProjectOwner = await temporaryProjectViewer(client, owner.user, project.id);
  await client.execute({
    sql: "DELETE FROM project_members WHERE project_id=? AND user_id=?",
    args: [project.id, owner.user.id],
  });
  assert.equal((await request(imageUrl, { cookie })).status, 404);
  await client.execute({
    sql: "INSERT INTO project_members(project_id,workspace_id,user_id) VALUES (?,?,?)",
    args: [project.id, owner.user.workspaceId, owner.user.id],
  });
  await restoreProjectOwner();
  console.log(
    "PASS: vision image input, image-only prompt, encrypted Base64 storage, random IVs, authenticated decryption, tenant/project access, tamper detection, input limits and atomic chat/image rollback.",
  );
}
