import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
let state;
const loaded = { exports: {} };
const code = ts.transpileModule(
  readFileSync("components/shared/use-document-navigation.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
new Function("require", "module", "exports", code)(
  () => ({
    useState: (initial) => {
      state ??= initial();
      return [
        state,
        (next) => {
          state = typeof next === "function" ? next(state) : next;
        },
      ];
    },
  }),
  loaded,
  loaded.exports,
);
const render = loaded.exports.useDocumentNavigation;
const a = { type: "artifact", id: "wbs-a" },
  b = { type: "artifact", id: "wbs-b" },
  c = { type: "snapshot", id: "source-c" };
let n = render("workspace:project");
assert.equal(n.target, undefined);
n.back();
n.forward();
n = render("workspace:project");
n.open(a);
n = render("workspace:project");
assert.deepEqual(n.target, a);
assert.equal(n.canBack, false);
assert.equal(n.canForward, false);
n.close();
n = render("workspace:project");
assert.equal(n.target, undefined);
n.open(b);
n = render("workspace:project");
assert.equal(n.canBack, true);
n.back();
n = render("workspace:project");
assert.deepEqual(n.target, a);
assert.equal(n.canForward, true);
n.forward();
n = render("workspace:project");
assert.deepEqual(n.target, b);
n.back();
n = render("workspace:project");
n.visit(c);
n = render("workspace:project");
assert.deepEqual(n.target, c);
assert.equal(n.canForward, false);
n.close();
n = render("workspace:project");
n.open(c);
n = render("workspace:project");
assert.equal(state.entries.length, 2);
n.back();
n = render("workspace:project");
assert.deepEqual(n.target, a);
n = render("workspace:other-project");
assert.equal(n.target, undefined);
assert.equal(n.canBack, false);
n.open(b);
n = render("workspace:other-project");
assert.equal(n.canBack, false);
n = render("other-workspace:other-project");
assert.equal(n.target, undefined);
console.log(
  "PASS document navigation: close/reopen history, back/forward, branch replacement, duplicate prevention, empty bounds and project/workspace isolation.",
);
