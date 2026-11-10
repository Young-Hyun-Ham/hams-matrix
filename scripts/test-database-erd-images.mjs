import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["scripts/test-rfp-source.mjs", "--database-erd-only"],
  { stdio: "inherit", windowsHide: true },
);
process.exitCode = result.status ?? 1;
