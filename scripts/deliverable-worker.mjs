import "./deliverable-worker-loader.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.NODE_ENV ??= "production";
const nextRequire = createRequire(require.resolve("next/package.json"));
nextRequire("@next/env").loadEnvConfig(
  process.cwd(),
  process.env.NODE_ENV === "development",
);
const { processNextDeliverable } = await import(
  "../lib/ai/deliverable-worker.ts"
);
const { db } = await import("../lib/db.ts");
if (process.argv.includes("--check")) {
  console.log("Deliverable worker runtime loaded successfully.");
} else {
  let stopping = false;
  const running = new Map();
  const concurrency = Math.min(
    8,
    Math.max(
      1,
      Math.floor(Number(process.env.DELIVERABLE_WORKER_CONCURRENCY)) || 2,
    ),
  );
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  console.log("Deliverable worker started (concurrency " + concurrency + ").");
  while (!stopping) {
    try {
      if (running.size < concurrency) {
        const job = await processNextDeliverable([...running.keys()]);
        if (job) {
          const task = job
            .run()
            .catch(() =>
              console.error(
                "Deliverable worker job interrupted; persisted state retained.",
              ),
            )
            .finally(() => running.delete(job.id));
          running.set(job.id, task);
          continue;
        }
      }
    } catch {
      console.error("Deliverable queue unavailable; retrying.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  // Graceful shutdown drains work. A forced restart recovers after lease expiry.
  await Promise.allSettled(running.values());
  db().close();
}
