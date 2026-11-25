import "./deliverable-worker-loader.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
nextRequire("@next/env").loadEnvConfig(
  process.cwd(),
  process.env.NODE_ENV === "development",
);
const { nextJob, processJob, cleanup } = await import(
  "../lib/chatbot/worker.ts"
);
const { existsSync } = await import("node:fs");
const { resolve } = await import("node:path");
while (existsSync(resolve(".auth-tests/chatbot-migration.lock")))
  await new Promise((resolve) => setTimeout(resolve, 500));
const { db } = await import("../lib/db.ts");
if (process.argv.includes("--check"))
  console.log("Chatbot worker runtime loaded.");
else if (process.argv.includes("--cleanup")) {
  await cleanup();
  db().close();
  console.log("Chatbot expired approvals cleaned.");
} else {
  let stopping = false,
    lastCleanup = 0,
    cleanupTask;
  const running = new Map(),
    concurrency = Math.max(
      1,
      Math.min(4, Number(process.env.CHATBOT_WORKER_CONCURRENCY) || 2),
    );
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  console.log("Independent chatbot worker started.");
  while (!stopping) {
    try {
      if (Date.now() - lastCleanup > 60000 && !cleanupTask) {
        lastCleanup = Date.now();
        cleanupTask = cleanup()
          .catch(() =>
            console.error(
              "Chatbot cleanup deferred; job processing continues.",
            ),
          )
          .finally(() => {
            cleanupTask = undefined;
          });
      }
      if (running.size < concurrency) {
        const job = await nextJob();
        if (job) {
          const task = processJob(job)
            .catch(() =>
              console.error(
                "Chatbot job interrupted; persisted state retained.",
              ),
            )
            .finally(() => running.delete(job.id));
          running.set(job.id, task);
          continue;
        }
      }
    } catch {
      console.error("Chatbot queue unavailable; pending state retained.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await Promise.allSettled(running.values());
  await cleanupTask;
  db().close();
}
