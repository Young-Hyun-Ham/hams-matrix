// Real HTTP routes, authentication and SQLite; only the external AI provider is mocked.
import { checkAiConversations } from "./check-ai-conversations.mjs";
import { checkAiTokenUsage } from "./check-ai-token-usage.mjs";
import { checkAiCancellation } from "./check-ai-cancellation.mjs";
import { checkAiGuardrails } from "./check-ai-guardrails.mjs";
import { checkAiConversationOptions } from "./check-ai-conversation-options.mjs";
import { checkAiImages } from "./check-ai-images.mjs";
import { checkAiCrud } from "./check-ai-crud.mjs";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
const folder = await mkdtemp(join(tmpdir(), "matrix-ai-"));
const url = pathToFileURL(join(folder, "test.db")).href,
  client = createClient({ url, timeout: 5000 });
await client.execute("PRAGMA journal_mode=WAL");
for (const name of (await readdir("db/migrations"))
  .filter((n) => n.endsWith(".sql"))
  .sort())
  await client.executeMultiple(
    (await readFile(join("db/migrations", name), "utf8")).replace(
      /^\uFEFF/,
      "",
    ),
  );
const origin = "http://localhost:3229";
const noImageKey = process.argv.includes("--no-image-key");
const server = spawn(
  process.execPath,
  [
    "--import",
    pathToFileURL(resolve("scripts/ai-test-provider.mjs")).href,
    resolve("node_modules/next/dist/bin/next"),
    "start",
    "--port",
    "3229",
  ],
  {
    windowsHide: true,
    env: {
      ...process.env,
      TURSO_DATABASE_URL: url,
      TURSO_AUTH_TOKEN: "",
      APP_URL: origin,
      OPENAI_API_KEY: "test-secret-key",
      AI_IMAGE_ENCRYPTION_KEY: noImageKey
        ? ""
        : Buffer.alloc(32, 66).toString("base64"),
      OPENAI_MODEL: "",
      OPENAI_MODELS: "",
      MATRIX_AI_TEST: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (v) => (logs += v));
server.stderr.on("data", (v) => (logs += v));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const request = (
  path,
  { cookie, method = "GET", data, requestOrigin = origin } = {},
) =>
  fetch(origin + path, {
    method,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== "GET"
        ? { Origin: requestOrigin, "Content-Type": "application/json" }
        : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/login")).ok) break;
    } catch {}
    if (i === 99) throw Error(logs);
    await pause(200);
  }
  const signup = async (email) => {
    const response = await request("/api/auth/signup", {
      method: "POST",
      data: {
        role: "user",
        plan: "free",
        name: "AI 검증",
        email,
        password: "Browserpass123!",
        accepted: true,
      },
    });
    assert.equal(response.status, 201, await response.clone().text());
    // This regression suite exercises persisted history; quota/Free policies have separate tests.
    await client.execute({ sql: "UPDATE user_subscriptions SET plan_code='business' WHERE user_id=(SELECT id FROM users WHERE email=?)", args: [email] });
    return {
      cookie: response.headers
        .getSetCookie()
        .find((v) => v.startsWith("hams_session="))
        .split(";")[0],
      user: (await response.json()).user,
    };
  };
  const owner = await signup("ai-owner@example.test"),
    other = await signup("ai-other@example.test"),
    cookie = owner.cookie;
  assert.equal((await request("/api/ai/models")).status, 401);
  assert.equal((await request("/api/ai/chats")).status, 401);
  const models = await (await request("/api/ai/models", { cookie })).json();
  assert.deepEqual(models.models, ["gpt-4o-mini", "gpt-5.6-sol"]);
  assert.equal(models.defaultModel, "gpt-5.6-sol");
  const projectResponse = await request("/api/projects", {
    cookie,
    method: "POST",
    data: {
      name: "AI 연계 프로젝트",
      description: "문서 연결 검증",
      memberIds: [],
    },
  });
  assert.equal(
    projectResponse.status,
    201,
    await projectResponse.clone().text(),
  );
  const project = (await projectResponse.json()).project;
  const makeRoom = async (projectId = "", session = cookie) => {
    const response = await request("/api/ai/conversations", {
      cookie: session,
      method: "POST",
      data: { projectId },
    });
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).conversation;
  };
  const room = await makeRoom(project.id),
    commonRoom = await makeRoom();
  const base = {
    convId: room.convId,
    prompt: "회원 관리 화면 설계해줘",
    model: "gpt-5.6-sol",
    pathname: `/projects/${project.id}`,
    projectId: project.id,
    tab: "screen",
  };
  const post = (data) =>
    request("/api/ai/chats", {
      cookie,
      method: "POST",
      data: { ...base, ...data },
    });
  assert.equal(
    (
      await request("/api/ai/chats", {
        cookie,
        method: "POST",
        data: base,
        requestOrigin: "https://invalid.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/api/ai/chats", {
        cookie: other.cookie,
        method: "POST",
        data: base,
      })
    ).status,
    404,
  );
  assert.equal((await post({ prompt: " " })).status, 400);
  assert.equal((await post({ prompt: "x".repeat(2001) })).status, 400);
  assert.equal((await post({ model: "arbitrary-model" })).status, 400);
  assert.equal((await post({ pathname: "/team" })).status, 400);
  assert.equal(
    (await post({ pathname: "/projects/wrong/nested" })).status,
    400,
  );
  assert.equal((await post({ tab: "__proto__" })).status, 400);
  const generated = await post({});
  assert.equal(generated.status, 200, await generated.clone().text());
  const chat = (await generated.json()).chat,
    generatedData = JSON.parse(chat.result);
  assert.ok(generatedData.instructions.includes("현재 탭: 화면 설계"));
  assert.ok(generatedData.instructions.includes("화면설계 담당자"));
  assert.equal(generatedData.store, false);
  assert.ok(
    JSON.stringify(generatedData.input.pageContext).includes(project.name),
  );
  assert.equal(chat.screenTitle, "AI 연계 프로젝트 · 화면 설계");
  const wbsResponse = await post({ tab: "wbs", prompt: "마일스톤을 제안해줘" });
  assert.equal(wbsResponse.status, 200);
  assert.ok(
    JSON.parse((await wbsResponse.json()).chat.result).instructions.includes(
      "현재 탭: WBS 일정",
    ),
  );
  const history = await (
    await request(
      `/api/ai/chats?projectId=${project.id}&convId=${room.convId}`,
      { cookie },
    )
  ).json();
  assert.equal(history.chats.length, 2);
  assert.equal(history.chats[0].id, chat.id);
  assert.equal(history.chats[0].result, chat.result);
  assert.equal(
    (
      await request(
        `/api/ai/chats?projectId=${project.id}&convId=${room.convId}`,
        {
          cookie: other.cookie,
        },
      )
    ).status,
    404,
  );
  assert.deepEqual(
    (
      await (
        await request("/api/ai/conversations", { cookie: other.cookie })
      ).json()
    ).conversations,
    [],
  );
  const failure = await post({ prompt: "[FAIL]" });
  assert.equal(failure.status, 429);
  assert.ok(!(await failure.text()).includes("test-secret-key"));
  assert.equal((await post({ prompt: "[INCOMPLETE]" })).status, 502);
  assert.equal(
    (
      await (
        await request(
          `/api/ai/chats?projectId=${project.id}&convId=${room.convId}`,
          { cookie },
        )
      ).json()
    ).chats.length,
    2,
  );
  const dashboard = await post({
    convId: commonRoom.convId,
    projectId: "",
    pathname: "/dashboard",
    tab: null,
    prompt: "다음 작업 알려줘",
  });
  assert.equal(dashboard.status, 200);
  assert.equal(
    (
      await (
        await request(`/api/ai/chats?convId=${commonRoom.convId}`, { cookie })
      ).json()
    ).chats.length,
    1,
  );
  await client.execute({
    sql: "INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,created_at,updated_at) VALUES ('other-room',?,?,?,'Private',datetime('now'),datetime('now'))",
    args: [owner.user.workspaceId, other.user.id, project.id],
  });
  await client.execute({
    sql: "INSERT INTO ai_prompt_chats(id,workspace_id,user_id,project_id,pathname,screen_title,prompt,model,result,conv_id) VALUES (?,?,?,?,?,?,?,?,?,?)",
    args: [
      "same-project-other-user",
      owner.user.workspaceId,
      other.user.id,
      project.id,
      base.pathname,
      "다른 사용자",
      "비공개",
      base.model,
      "노출 금지",
      "other-room",
    ],
  });
  assert.equal(
    (
      await (
        await request(
          `/api/ai/chats?projectId=${project.id}&convId=${room.convId}`,
          { cookie },
        )
      ).json()
    ).chats.length,
    2,
  );
  if (noImageKey) {
    const response = await post({
      images: [
        {
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQIoAAAAASUVORK5CYII=",
        },
      ],
    });
    assert.equal(response.status, 503);
    console.log(
      "PASS: image writes fail closed without an encryption key; text-only AI remains available.",
    );
  } else
    await checkAiImages({
      request,
      client,
      cookie,
      owner,
      other,
      project,
      base,
    });
  await checkAiCrud({
    request,
    client,
    cookie,
    owner,
    other,
    project,
    base: { ...base, convId: (await makeRoom(project.id)).convId },
    commonRoom,
  });
  await checkAiConversations({
    request,
    client,
    cookie,
    owner,
    other,
    project,
    base,
    makeRoom,
  });
  if (!noImageKey)
    await checkAiConversationOptions({
      request,
      client,
      cookie,
      other,
      project,
      base,
      makeRoom,
    });
  await checkAiTokenUsage({
    request,
    client,
    cookie,
    other,
    project,
    base,
    makeRoom,
  });
  await checkAiCancellation({ request, client, cookie, other, project, base, makeRoom });
  await checkAiGuardrails({ request, client, cookie, owner, other, project, base, makeRoom });
  const clientHtml = await (
    await request(`/projects/${project.id}`, { cookie })
  ).text();
  assert.ok(!clientHtml.includes("test-secret-key"));
  console.log(
    "PASS: AI model filtering, auth/origin/project access, input validation, per-tab prompts, Responses parsing, persisted user/project history, failure handling and no secret exposure.",
  );
} catch (error) {
  console.error(logs.slice(-3000));
  throw error;
} finally {
  client.close();
  if (server.exitCode === null)
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
}
