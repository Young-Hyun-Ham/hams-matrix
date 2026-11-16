import assert from "node:assert/strict";
import "./deliverable-worker-loader.mjs";
const { generateAi } = await import("../lib/ai-server.ts");
const { GenerationCancelled } = await import("../lib/ai/generation-control.ts");
const original = {
  fetch: globalThis.fetch,
  now: Date.now,
  timeout: globalThis.setTimeout,
  key: process.env.OPENAI_API_KEY,
};
let now = original.now(),
  creates = 0,
  cancels = 0,
  polls = 0,
  transient = false,
  savedId;
const complete = {
  id: "resp-durable",
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: "durable-result" }],
    },
  ],
};
function reset() {
  now = original.now();
  creates = 0;
  cancels = 0;
  polls = 0;
  savedId = undefined;
  transient = false;
}
try {
  process.env.OPENAI_API_KEY = "synthetic-test-key";
  Date.now = () => now;
  globalThis.setTimeout = (callback, _ms, ...args) => {
    now += 65000;
    queueMicrotask(() => callback(...args));
    return 0;
  };
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/cancel")) {
      cancels++;
      return Response.json({ id: "resp-durable", status: "cancelled" });
    }
    if (init?.method === "POST") {
      creates++;
      assert.equal(JSON.parse(init.body).background, true);
      assert.ok(!init.signal.aborted);
      return Response.json({ id: "resp-durable", status: "queued" });
    }
    polls++;
    if (transient && polls === 1) return Response.json({}, { status: 503 });
    return Response.json(
      polls < 3 ? { id: "resp-durable", status: "in_progress" } : complete,
    );
  };
  reset();
  transient = true;
  const start = now;
  assert.equal(
    await generateAi(
      "test-model",
      "instructions",
      "source",
      undefined,
      [],
      [],
      undefined,
      async () => {},
      {
        deadline: null,
        onResponse: async (id) => {
          savedId = id;
        },
      },
    ),
    "durable-result",
  );
  assert.ok(
    now - start > 120000,
    "worker survives beyond the old 120-second budget",
  );
  assert.equal(creates, 1);
  assert.equal(savedId, "resp-durable");
  assert.equal(cancels, 0);

  reset();
  polls = 2;
  assert.equal(
    await generateAi(
      "test-model",
      "instructions",
      "source",
      undefined,
      [],
      [],
      undefined,
      async () => {},
      {
        deadline: null,
        resumeResponseId: "resp-durable",
      },
    ),
    "durable-result",
  );
  assert.equal(
    creates,
    0,
    "restart retrieves the existing response without paid recreation",
  );

  reset();
  await assert.rejects(
    () => generateAi("test-model", "instructions", "source"),
    (e) => e.status === 504,
  );
  assert.equal(cancels, 1, "foreground timeout behavior remains unchanged");

  reset();
  let checkpoints = 0;
  await assert.rejects(
    () =>
      generateAi(
        "test-model",
        "instructions",
        "source",
        undefined,
        [],
        [],
        undefined,
        async () => {
          if (++checkpoints > 2) throw new GenerationCancelled();
        },
        { deadline: null },
      ),
    GenerationCancelled,
  );
  assert.equal(cancels, 1, "user stop confirms provider cancellation");
  console.log(
    "PASS: worker wait beyond 120 seconds, transient polling recovery, persisted response retrieval without recreation, foreground budget preserved, confirmed cancellation.",
  );
} finally {
  globalThis.fetch = original.fetch;
  Date.now = original.now;
  globalThis.setTimeout = original.timeout;
  if (original.key === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = original.key;
}
