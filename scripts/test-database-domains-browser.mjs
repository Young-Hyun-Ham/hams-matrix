import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.execPath,
  ["scripts/test-navigation-browser.mjs", "--database-only"],
  { stdio: "inherit", windowsHide: true },
);
process.exitCode = result.status ?? 1;
