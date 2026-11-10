// Real authenticated GET handler and isolated SQLite; no .env or external AI calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import ts from "typescript";

const folder = await mkdtemp(join(tmpdir(), "matrix-chat-pages-"));
const client = createClient({
  url: pathToFileURL(join(folder, "test.db")).href,
});
const require = createRequire(import.meta.url),
  cache = new Map();
process.env.APP_URL = "http://test.local";
let token = "owner-session";
function load(file) {
  if (file === resolve("lib/db.ts")) return { db: () => client };
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
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
      const target = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!target) throw new Error(base);
      return load(target);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
try {
  await client.execute("PRAGMA foreign_keys=ON");
  for (const name of (await readdir("db/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await client.executeMultiple(
      await readFile(join("db/migrations", name), "utf8"),
    );
  await client.executeMultiple(`
    INSERT INTO users(id,name,account_role) VALUES ('owner','Owner','user'),('other','Other','user');
    UPDATE user_subscriptions SET plan_code='pro';
    INSERT INTO workspaces(id,name,owner_id) VALUES ('ws','Workspace','owner'),('other-ws','Other','other');
    INSERT INTO workspace_members(workspace_id,user_id,role) VALUES ('ws','owner','owner'),('other-ws','other','owner');
    INSERT INTO projects(id,workspace_id,name,created_by,owner_id) VALUES ('p','ws','Project','owner','owner');
    INSERT INTO project_members(project_id,workspace_id,user_id,role) VALUES ('p','ws','owner','admin');
  `);
  for (const id of ["owner", "other"])
    await client.execute({
      sql: "INSERT INTO sessions(id,token_hash,user_id,workspace_id,created_at,expires_at) VALUES (?,?,?,?,?,?)",
      args: [
        id,
        createHash("sha256").update(`${id}-session`).digest("hex"),
        id,
        id === "owner" ? "ws" : "other-ws",
        new Date().toISOString(),
        new Date(Date.now() + 3600000).toISOString(),
      ],
    });
  const route = load(resolve("app/api/ai/chats/route.ts"));
  const get = (room, before, projectId = "p") =>
    route.GET(
      new Request(
        `http://test.local/api/ai/chats?projectId=${projectId}&convId=${room}${before === undefined ? "" : `&before=${before}`}`,
      ),
    );
  async function createRoom(id, count, projectId = "p") {
    await client.execute({
      sql: "INSERT INTO ai_conversations(conv_id,workspace_id,user_id,project_id,title,created_at,updated_at) VALUES (?,'ws','owner',?,?,'2026-11-10T00:00:00Z','2026-11-10T00:00:00Z')",
      args: [id, projectId || null, id],
    });
    if (count)
      await client.batch(
        Array.from({ length: count }, (_, index) => ({
          sql: "INSERT INTO ai_prompt_chats(id,workspace_id,user_id,project_id,pathname,screen_title,prompt,model,result,conv_id,created_at) VALUES (?,'ws','owner',?,'/dashboard','Test',?,'test-model','Reply',?,'2026-11-10T00:00:00Z')",
          args: [`${id}-${index}`, projectId || null, `Prompt ${index}`, id],
        })),
        "write",
      );
  }
  for (const count of [0, 1, 10, 11, 20, 25, 55]) {
    const room = `room-${count}`;
    await createRoom(room, count);
    let cursor,
      seen = [],
      requests = 0;
    do {
      const response = await get(room, cursor);
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      const page = await response.json();
      assert.equal(page.chats.length, Math.min(10, count - seen.length));
      assert.ok(page.chats.every((chat) => chat.convId === room));
      seen.unshift(...page.chats);
      if (page.nextCursor) {
        assert.match(page.nextCursor, /^\d+$/);
        if (cursor) assert.ok(BigInt(page.nextCursor) < BigInt(cursor));
      }
      cursor = page.nextCursor;
      requests++;
    } while (cursor);
    assert.equal(requests, Math.max(1, Math.ceil(count / 10)));
    assert.deepEqual(
      seen.map((chat) => chat.id),
      Array.from({ length: count }, (_, index) => `${room}-${index}`),
    );
    assert.equal(new Set(seen.map((chat) => chat.id)).size, count);
  }
  // Inserts between pages cannot shift a stable rowid cursor or repeat old messages.
  for (const index of [8, 24])
    await client.execute({
      sql: "INSERT INTO ai_chat_images(id,chat_id,workspace_id,user_id,position,mime_type,byte_length,width,height,key_id,iv_base64,tag_base64,ciphertext_base64) VALUES (?,?,'ws','owner',0,'image/png',1,1,1,'test','test','test','test')",
      args: [`image-${index}`, `room-25-${index}`],
    });
  const latest = await (await get("room-25")).json();
  assert.equal(latest.chats.at(-1).images[0].id, "image-24");
  assert.equal(JSON.stringify(latest).includes("ciphertext"), false);
  await client.execute(
    "INSERT INTO ai_prompt_chats(id,workspace_id,user_id,project_id,pathname,screen_title,prompt,model,result,conv_id) VALUES ('inserted','ws','owner','p','/dashboard','Test','New','test','Reply','room-25')",
  );
  const previous = await (await get("room-25", latest.nextCursor)).json();
  assert.equal(
    previous.chats.find((chat) => chat.id === "room-25-8").images[0].id,
    "image-8",
  );
  assert.deepEqual(
    previous.chats.map((chat) => chat.id),
    Array.from({ length: 10 }, (_, index) => `room-25-${index + 5}`),
  );
  assert.equal(
    previous.chats.some((chat) =>
      latest.chats.some((item) => item.id === chat.id),
    ),
    false,
  );
  const replay = await (await get("room-25", latest.nextCursor)).json();
  assert.deepEqual(replay, previous);
  await createRoom("shared", 11, "");
  assert.equal(
    (await (await get("shared", undefined, "")).json()).chats.length,
    10,
  );
  for (const before of ["abc", "-1", "1.2", "9999999999999999999"])
    assert.equal((await get("room-25", before)).status, 400);
  assert.equal((await get("room-25", "0")).status, 200);
  assert.equal((await (await get("room-25", "0")).json()).chats.length, 0);
  assert.equal((await get("missing")).status, 404);
  assert.equal((await get("room-25", undefined, "")).status, 404);
  token = "other-session";
  assert.equal((await get("shared", undefined, "")).status, 404);
  token = "";
  assert.equal((await get("shared", undefined, "")).status, 401);
  assert.equal(
    (await client.execute("PRAGMA foreign_key_check")).rows.length,
    0,
  );
  console.log(
    "PASS: authenticated 10-item pages, 0/1/10/11/20/25/55 boundaries, same-time cursor stability, no gaps/duplicates, inserts/replay, shared/project/user scopes, invalid cursors, auth and foreign keys",
  );
} finally {
  client.close();
}
