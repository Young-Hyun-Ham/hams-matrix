import assert from "node:assert/strict";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import ts from "typescript";
const paths = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await walk(path);
    else if (/\.(?:tsx?|jsx?|mjs|cjs)$/.test(entry.name)) paths.push(path);
  }
}
for (const root of ["app", "components", "lib", "stores"]) await walk(root);
const names = new Set([
  "fetch",
  "window.fetch",
  "globalThis.fetch",
  "originalFetch",
  "jsonRequest",
  "teamJsonRequest",
  "fetchTeam",
  "boardFetch",
  "planningFetch",
  "templateRequest",
  "requestJson",
  "browserGetJson",
  "serverGetJson",
  "teamRequestJson",
  "requestBlob",
  "transport",
]);
const entries = [];
for (const path of paths) {
  const text = await readFile(path, "utf8"),
    file = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
  function visit(node) {
    if (ts.isCallExpression(node) && names.has(node.expression.getText(file))) {
      const call = node.expression.getText(file);
      let category, reason;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (
          ts.isPropertyAssignment(parent) &&
          parent.name.getText(file) === "queryFn"
        ) {
          category = "Q/IQ";
          reason = "Query function";
          break;
        }
        if (
          ts.isPropertyAssignment(parent) &&
          parent.name.getText(file) === "mutationFn"
        ) {
          category = "M";
          reason = "Mutation function";
          break;
        }
      }
      if (
        text.includes("useBoardTransport()") &&
        ["fetch", "boardFetch"].includes(call)
      ) {
        category = "Q/M adapter";
        reason = "JSON cache plus accepted editor snapshot and version cursor";
      }
      if (path === "components/ai/ai-chatbot.tsx" && call === "fetch") {
        category = "I";
        reason = "Explicit generation command; no automatic replay";
      }
      if (call === "requestBlob") {
        category = "I";
        reason = "Private binary transfer; no Blob hydration";
      }
      if (
        path.startsWith("app/(editor)/planning-board/lib/server/") ||
        [
          "lib/ai-server.ts",
          "lib/ai/image-generation.ts",
          "lib/ai/background-response.ts",
          "lib/oauth.ts",
          "lib/onlyoffice.ts",
        ].includes(path)
      ) {
        category = "S";
        reason = "Server-only provider, OAuth or document transfer";
      }
      if (
        path.startsWith("lib/query/") ||
        [
          "lib/client-request.ts",
          "lib/team-request.ts",
          "lib/preferences-request.ts",
          "app/(editor)/planning-board/lib/client-api.ts",
          "app/(editor)/planning-board/lib/upload-image.ts",
        ].includes(path) ||
        (path === "components/workspace-plan-guard.tsx" &&
          call === "originalFetch")
      ) {
        category = "T";
        reason =
          "Transport or response observation; hooks own runtime requests";
      }
      if (
        path === "app/(editor)/planning-board/lib/template-api.ts" &&
        ["planningFetch", "requestJson"].includes(call)
      ) {
        category = "T";
        reason = "Permission-preserving template transport";
      }
      if (
        path ===
          "app/(editor)/planning-board/components/planning-board-editor.tsx" &&
        call === "templateRequest" &&
        text.includes("useTemplateRequest()")
      ) {
        category = "Q/M adapter";
        reason =
          "Template query/mutation hook; builtin access and version checks preserved";
      }
      const position = file.getLineAndCharacterOfPosition(node.getStart(file));
      entries.push({
        path,
        line: position.line + 1,
        call,
        category: category ?? "UNCLASSIFIED",
        reason: reason ?? "Review required",
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
}
await mkdir(".auth-tests", { recursive: true });
await writeFile(
  ".auth-tests/fetch-audit.json",
  JSON.stringify(entries, null, 2),
);
const counts = Object.fromEntries(
  [...new Set(entries.map((item) => item.category))]
    .sort()
    .map((category) => [
      category,
      entries.filter((item) => item.category === category).length,
    ]),
);
const unclassified = entries.filter((item) => item.category === "UNCLASSIFIED");
console.log(
  JSON.stringify(
    {
      files: new Set(entries.map((item) => item.path)).size,
      calls: entries.length,
      counts,
      unclassified,
    },
    null,
    2,
  ),
);
assert.equal(
  unclassified.length,
  0,
  "Every remaining network call must have an explicit Query/Mutation/transport/command/server role",
);
