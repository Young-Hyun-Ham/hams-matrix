import assert from "node:assert/strict";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

export async function checkDatabaseErdImages({ load, client, setToken }) {
  process.env.AI_IMAGE_ENCRYPTION_KEY = Buffer.alloc(32, 73).toString("base64");
  process.env.OPENAI_MODELS = "gpt-5.6-sol";
  const route = load(
    resolve("app/api/projects/[projectId]/database/erd/image/route.ts"),
  );
  const content = load(
    resolve("app/api/projects/[projectId]/database/erd/image/content/route.ts"),
  );
  const geometry = load(resolve("lib/database-erd-layout.ts"));
  const images = load(resolve("lib/ai/database-erd-images.ts"));
  const context = (projectId = "project") => ({
    params: Promise.resolve({ projectId }),
  });
  const request = (
    method,
    value,
    query = "",
    origin = "http://localhost:3000",
  ) =>
    new Request(`http://localhost:3000/test${query}`, {
      method,
      headers: { origin, "Content-Type": "application/json" },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  const get = async () => {
    const response = await route.GET(request("GET"), context());
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const post = (input, origin) =>
    route.POST(request("POST", input, "", origin), context());
  const read = (id, download = false, projectId = "project") =>
    content.GET(
      request(
        "GET",
        undefined,
        `?imageId=${encodeURIComponent(id)}${download ? "&download=1" : ""}`,
      ),
      context(projectId),
    );
  const check = async (response, status = 200) => {
    assert.equal(response.status, status, await response.clone().text());
    return response.json();
  };
  const stored = async () =>
    (
      await client.execute(
        "SELECT * FROM database_erd_images WHERE project_id='project'",
      )
    ).rows[0];
  setToken("");
  assert.equal((await route.GET(request("GET"), context())).status, 401);
  setToken("owner-token");
  const empty = await get();
  assert.equal(empty.image, null);
  await check(await post({ sourceHash: empty.sourceHash }), 400);
  const defs = [
    ["users", []],
    ["orders", [["user_id", "users"]]],
    [
      "items",
      [
        ["order_id", "orders"],
        ["product_id", "products"],
      ],
    ],
    ["products", [["owner_id", "users"]]],
    ["cycle_a", [["next_id", "cycle_b"]]],
    ["cycle_b", [["next_id", "cycle_a"]]],
    ["categories", [["parent_id", "categories"]]],
    ["isolated", []],
  ];
  const col = (id, reference) => ({
    id,
    name: id,
    dataType: "BIGINT",
    length: "",
    nullable: !!reference,
    primaryKey: !reference,
    unique: false,
    defaultValue: "",
    description: "",
    ...(reference ? { reference: { tableId: reference, columnId: "id" } } : {}),
  });
  for (const [index, [id, references]] of defs.entries()) {
    await client.execute({
      sql: "INSERT INTO project_artifacts(id,workspace_id,project_id,kind,code,title,status,fields_json,structure_json,version,created_by,updated_by,created_at,updated_at) VALUES (?,'ws','project','database',?,?,'초안',?,?,1,'owner','owner','now','now')",
      args: [
        id,
        `DB-${index}`,
        id,
        JSON.stringify({
          definition: "Synthetic ERD",
          physicalName: id,
          logicalName: `${id} 한글 테이블`,
        }),
        JSON.stringify({
          columns: [
            col("id"),
            ...references.map(([column, table]) => col(column, table)),
          ],
        }),
      ],
    });
  }
  setToken("reader-token");
  const before = await get();
  await check(await post({ sourceHash: before.sourceHash }), 403);
  setToken("outsider-token");
  assert.equal((await route.GET(request("GET"), context())).status, 404);
  setToken("owner-token");
  await check(
    await post({ sourceHash: before.sourceHash }, "https://invalid.example"),
    403,
  );
  const originalFetch = globalThis.fetch;
  let calls = 0,
    fail = false,
    invalid = false,
    onGeneration;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.text.format.name, "database_erd_layout");
    const source = JSON.parse(body.input);
    assert.equal(source.tables.length, 8);
    assert.equal(source.relations.length, 7);
    calls++;
    if (onGeneration) await onGeneration();
    if (fail) return new Response("provider failed", { status: 502 });
    return Response.json({
      status: "completed",
      usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                tableIds: invalid
                  ? ["invented"]
                  : source.tables.map((t) => t.id).reverse(),
              }),
            },
          ],
        },
      ],
    });
  };
  try {
    const first = await check(await post({ sourceHash: before.sourceHash }));
    assert.equal(calls, 1);
    assert.equal(first.reused, false);
    const row = await stored();
    assert.equal(row.id, first.image.id);
    assert.ok(row.ciphertext_base64);
    assert.ok(!String(row.ciphertext_base64).startsWith("iVBOR"));
    const layout = JSON.parse(row.layout_json);
    const user = {
      id: "owner",
      workspaceId: "ws",
      name: "Owner",
      role: "owner",
      accountRole: "user",
      onboardingComplete: true,
    };
    const snapshot = await images.databaseErdFor(client, user, "project");
    geometry.validateErdLayout(layout, snapshot.source);
    assert.equal(layout.nodes.length, 8);
    assert.equal(layout.edges.length, 7);
    const response = await read(first.image.id, true);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "image/png");
    assert.ok(
      response.headers.get("Content-Disposition").startsWith("attachment"),
    );
    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    const evidence = join(
      dirname(fileURLToPath(process.env.TURSO_DATABASE_URL)),
      "erd-preview.png",
    );
    await writeFile(evidence, png);
    console.log(`ERD image evidence: ${evidence}`);
    const reused = await check(await post({ sourceHash: "old" }));
    assert.equal(reused.reused, true);
    assert.equal(reused.image.id, first.image.id);
    assert.equal(calls, 1);
    assert.equal((await get()).image.id, first.image.id);
    assert.equal(calls, 1);
    setToken("reader-token");
    assert.equal((await read(first.image.id)).status, 200);
    setToken("owner-token");
    assert.equal((await read(first.image.id, false, "second")).status, 404);
    await client.execute(
      "UPDATE projects SET name='Changed project' WHERE id='project'",
    );
    const stale = await get();
    assert.notEqual(stale.sourceHash, first.image.sourceHash);
    assert.equal(stale.image.id, first.image.id);
    assert.equal(calls, 1);
    await check(
      await post({
        regenerate: true,
        sourceHash: stale.sourceHash,
        expectedImageId: "old",
      }),
      409,
    );
    await check(
      await post({
        regenerate: true,
        sourceHash: before.sourceHash,
        expectedImageId: first.image.id,
      }),
      409,
    );
    invalid = true;
    await check(
      await post({
        regenerate: true,
        sourceHash: stale.sourceHash,
        expectedImageId: first.image.id,
      }),
      502,
    );
    invalid = false;
    assert.equal((await stored()).id, first.image.id);
    fail = true;
    await check(
      await post({
        regenerate: true,
        sourceHash: stale.sourceHash,
        expectedImageId: first.image.id,
      }),
      502,
    );
    fail = false;
    assert.equal((await stored()).id, first.image.id);
    onGeneration = async () => {
      await client.execute(
        "UPDATE projects SET name='Changed during generation' WHERE id='project'",
      );
    };
    await check(
      await post({
        regenerate: true,
        sourceHash: stale.sourceHash,
        expectedImageId: first.image.id,
      }),
      409,
    );
    onGeneration = undefined;
    assert.equal((await stored()).id, first.image.id);
    const latest = await get();
    await client.execute({
      sql: "INSERT INTO database_erd_image_generations VALUES ('project','ws','other',?)",
      args: [Date.now() + 300000],
    });
    const oldCalls = calls;
    await check(
      await post({
        regenerate: true,
        sourceHash: latest.sourceHash,
        expectedImageId: first.image.id,
      }),
      409,
    );
    assert.equal(calls, oldCalls);
    await client.execute("DELETE FROM database_erd_image_generations");
    const second = await check(
      await post({
        regenerate: true,
        sourceHash: latest.sourceHash,
        expectedImageId: first.image.id,
      }),
    );
    assert.notEqual(second.image.id, first.image.id);
    assert.equal((await read(first.image.id)).status, 404);
    const remaining = await client.execute(
      "SELECT COUNT(*) AS n FROM database_erd_image_generations",
    );
    assert.equal(Number(remaining.rows[0].n), 0);
    const sourceCount = await client.execute(
      "SELECT COUNT(*) AS n FROM project_artifacts WHERE kind='database'",
    );
    assert.equal(Number(sourceCount.rows[0].n), 8);
    const bad = structuredClone(layout);
    bad.edges[0].points = [
      { x: bad.nodes[0].x + 10, y: bad.nodes[0].y + 10 },
      { x: bad.nodes[0].x + 20, y: bad.nodes[0].y + 10 },
    ];
    assert.throws(() => geometry.validateErdLayout(bad, snapshot.source));
    assert.equal(
      (await client.execute("PRAGMA foreign_key_check")).rows.length,
      0,
    );
    console.log(
      "PASS ERD images: real orthogonal layout/PNG, cycles/self-FK/disconnected graph, cache/stale reuse, explicit regeneration, download/decryption, permission/scope, origin, concurrency, failure preservation and source conflict.",
    );
  } finally {
    globalThis.fetch = originalFetch;
    setToken("owner-token");
  }
}
