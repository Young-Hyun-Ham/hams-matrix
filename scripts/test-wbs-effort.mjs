import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function load(file, imports = {}) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => {
      if (!(name in imports)) throw new Error(name);
      return imports[name];
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const schedule = load("lib/wbs-schedule.ts", { "./integration": {} });
const { plannedWorkingHours: hours, withPlannedEffort } = load(
  "lib/wbs-effort.ts",
  {
    "./wbs-schedule": schedule,
  },
);
assert.equal(hours("2026-11-16", "2026-11-16"), "8");
assert.equal(hours("2026-11-16", "2026-11-20"), "40");
assert.equal(hours("2026-11-20", "2026-11-23"), "16");
assert.equal(hours("2026-11-21", "2026-11-22"), "0");
assert.equal(hours("2026-11-16", "2026-11-29"), "80");
assert.equal(hours("2026-12-31", "2027-01-04"), "24");
assert.equal(hours("2028-02-28", "2028-03-01"), "24");
for (const [start, end] of [
  ["", "2026-11-16"],
  ["2026-11-16", ""],
  ["2026-02-30", "2026-03-02"],
  ["2026-11-20", "2026-11-16"],
]) {
  assert.equal(hours(start, end), "");
}
const fields = {
  taskType: "작업",
  startDate: "2026-11-16",
  endDate: "2026-11-20",
  actualEffort: "12",
};
assert.equal(withPlannedEffort(fields).plannedEffort, "40");
assert.equal(withPlannedEffort(fields).actualEffort, "12");
assert.equal(
  withPlannedEffort({ ...fields, taskType: "마일스톤" }).plannedEffort,
  "0",
);
console.log(
  "WBS effort: working days, date boundaries, milestones and actual effort preservation passed.",
);
