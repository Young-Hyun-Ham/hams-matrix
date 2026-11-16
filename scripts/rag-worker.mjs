import "./deliverable-worker-loader.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.NODE_ENV ??= "production";
createRequire(require.resolve("next/package.json"))("@next/env").loadEnvConfig(
  process.cwd(),
  process.env.NODE_ENV === "development",
);
const { processNextRagJob } = await import("../lib/ai/rag-worker.ts");
const { db } = await import("../lib/db.ts");
if (process.argv.includes("--check"))
  console.log("RAG worker runtime loaded successfully.");
else {
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  console.log("Project RAG worker started.");
  while (!stopping) {
    try {
      const job = await processNextRagJob();
      if (job) {
        await job.run();
        continue;
      }
    } catch {
      console.error("Project RAG queue unavailable; persisted state retained.");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  db().close();
}
