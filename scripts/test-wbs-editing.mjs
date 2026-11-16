import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, imports) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  new Function("require", "module", "exports", code)(
    (name) => (name in imports ? imports[name] : require(name)),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
const { definitions } = load("lib/artifact-types.ts", {});
const schedule = load("lib/wbs-schedule.ts", {
  "./integration": {
    taskMetrics: () => ({ progress: 0, plannedEffort: 0, actualEffort: 0 }),
  },
});
let context;
let state = [],
  cursor = 0,
  effects = [];
const hooks = {
  useState: (initial) => {
    const index = cursor++;
    if (!(index in state))
      state[index] = typeof initial === "function" ? initial() : initial;
    return [
      state[index],
      (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next;
      },
    ];
  },
  useMemo: (fn) => fn(),
  useRef: (value) => ({ current: value }),
  useEffect: (fn) => effects.push(fn),
};
const { useWbsSchedule: renderSchedule, scheduleRows } = load(
  "components/pages/wbs/use-wbs-schedule.ts",
  {
    react: hooks,
    "@/components/query/use-workspace-error-state": {
      useWorkspaceErrorState: hooks.useState,
    },
    "@/lib/artifact-types": { definitions },
    "@/lib/wbs-schedule": schedule,
    "@tanstack/react-query": { useQueryClient: () => ({}) },
    "@/components/query/use-workspace-mutation": {
      useWorkspaceMutation: () => ({}),
    },
    "@/components/query/workspace-query-runtime": {
      useWorkspaceQueryPolicy: () => ({ scope: {} }),
    },
    "@/lib/query/keys": { matrixKeys: {} },
    "@/lib/query/browser-fetch": {},
    "@/lib/query/error-messages": {},
    "@/components/shared/project-page-context": {
      useProjectPage: () => context,
    },
  },
);
const pending = {
  id: "pending",
  kind: "wbs",
  code: "WBS-001",
  title: "Pending",
  version: 1,
  fields: { taskType: "작업", startDate: "", endDate: "", progress: "0" },
  links: [],
  structure: {},
};
context = {
  user: { id: "user", workspaceId: "workspace" },
  data: { project: { id: "project" }, artifacts: [pending] },
  artifacts: [pending],
  can: () => true,
};
let model = renderSchedule();
assert.equal(
  model.tasks[0].id,
  "pending",
  "unscheduled tasks belong to WBS System",
);
assert.equal(scheduleRows([pending]).length, 1);
const added = { ...pending, id: "new-pending", code: "WBS-002" };
context = {
  ...context,
  data: { ...context.data, artifacts: [pending, added] },
  artifacts: [pending, added],
};
cursor = 0;
effects = [];
renderSchedule();
effects.at(-1)();
await Promise.resolve();
cursor = 0;
effects = [];
model = renderSchedule();
assert.equal(
  model.tasks.length,
  2,
  "shared modal CRUD synchronizes a clean WBS System",
);
model.applyTask({ ...pending, title: "Local edit" });
context = {
  ...context,
  data: {
    ...context.data,
    artifacts: [pending, added, { ...pending, id: "third" }],
  },
};
cursor = 0;
effects = [];
model = renderSchedule();
assert.equal(model.dirty, true);
effects.at(-1)();
await Promise.resolve();
cursor = 0;
model = renderSchedule();
assert.equal(
  model.tasks.find((task) => task.id === "pending").title,
  "Local edit",
  "remote CRUD preserves unsaved local changes",
);
let shared = { fields: { taskType: "요약" } };
const { WbsDeliverableLinks } = load(
  "components/pages/wbs/wbs-deliverable-links.tsx",
  { "./wbs-form-state": { useWbsForm: () => shared } },
);
const target = { ...pending, id: "target" };
let html = renderToStaticMarkup(
  WbsDeliverableLinks({
    targets: [target],
    artifact: { ...pending, links: [target.id] },
  }),
);
assert.match(html, /disabled/);
assert.match(html, /저장 시/);
shared = { fields: { taskType: "작업" } };
html = renderToStaticMarkup(
  WbsDeliverableLinks({ targets: [target], artifact: pending }),
);
assert.doesNotMatch(html, /disabled/);
console.log(
  "PASS WBS editing: unscheduled rows, clean refresh, dirty draft preservation, summary assignment controls.",
);
