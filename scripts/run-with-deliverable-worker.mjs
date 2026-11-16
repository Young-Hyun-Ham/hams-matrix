// Long-lived Node hosting: supervise web and worker as separate processes.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mode = process.argv[2];
if (!["dev", "start"].includes(mode)) throw Error("Expected dev or start");
process.env.NODE_ENV ??= mode === "dev" ? "development" : "production";
const nextRequire = createRequire(require.resolve("next/package.json"));
nextRequire("@next/env").loadEnvConfig(process.cwd(), mode === "dev");
let ending = false,
  worker;
let ragWorker;
const launchRagWorker = () => {
  ragWorker = spawn(process.execPath, ["scripts/rag-worker.mjs"], {
    stdio: "inherit",
    windowsHide: true,
  });
  ragWorker.on("exit", () => {
    if (!ending) setTimeout(launchRagWorker, 2000);
  });
};
const launchWorker = () => {
  worker = spawn(process.execPath, ["scripts/deliverable-worker.mjs"], {
    stdio: "inherit",
    windowsHide: true,
  });
  worker.on("exit", () => {
    if (!ending) setTimeout(launchWorker, 2000);
  });
};
launchWorker();
launchRagWorker();
const web = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), mode, ...process.argv.slice(3)],
  { stdio: "inherit", windowsHide: true },
);
const stop = () => {
  if (ending) return;
  ending = true;
  web.kill();
  worker?.kill();
  ragWorker?.kill();
  // Persisted AI response IDs allow a replacement worker to recover after lease expiry.
  setTimeout(() => worker?.kill("SIGKILL"), 5000).unref();
  setTimeout(() => ragWorker?.kill("SIGKILL"), 5000).unref();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
web.on("exit", (code) => {
  stop();
  process.exitCode = code ?? 1;
});
