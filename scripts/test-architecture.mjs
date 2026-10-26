import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";


import ts from "typescript";

const root = process.cwd();
const require = createRequire(import.meta.url);
const compile = (source, fileName) => ts.transpileModule(source, {
  fileName,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const sourcePath = (request, parent) => {
  const base = request.startsWith("@/") ? resolve(root, request.slice(2)) : resolve(dirname(parent), request);
  return [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
};
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loaded = { exports: {} };
  cache.set(file, loaded);
  new Function("require", "module", "exports", compile(readFileSync(file, "utf8"), file))((request) => {
    if (file.endsWith("artifact-validation.ts") && request === "./auth")
      return { HttpError: class extends Error { constructor(status, message) { super(message); this.status = status; } } };
    return request.startsWith(".") || request.startsWith("@/") ? load(sourcePath(request, file)) : require(request);
  }, loaded, loaded.exports);
  return loaded.exports;
}
const { validateTopology, topologyFor } = load(resolve("lib/architecture.ts"));
const { prepareStructure } = load(resolve("lib/artifact-validation.ts"));
const { architectureLayout } = load(resolve("components/pages/architecture/architecture-layout.ts"));
const topology = {
  nodes: [
    ["browser", "Web Browser", "Next.js / React / TypeScript", "client", "service"],
    ["mobile", "Mobile App", "React Native", "client", "service"],
    ["gateway", "API Gateway", "Nginx · Routing / SSL Termination", "gateway", "service"],
    ["frontend", "Frontend Server", "Next.js · App Router / SSR", "frontend", "service"],
    ["api", "Backend API", "Python 3.12 / FastAPI 0.115\n인증 · 비즈니스 로직 · ORM", "backend", "service"],
    ["database", "PostgreSQL", "PostgreSQL 16 · Relational Data", "data", "database"],
    ["cache", "Caching", "Redis · API Caching", "data", "database"],
    ["auth", "Auth Service", "JWT / OAuth", "external", "service"],
  ].map(([id, name, technology, layer, shape]) => ({ id, name, technology, layer, shape })),
  edges: [
    ["browser", "gateway", "HTTPS / REST API"], ["mobile", "gateway", "HTTPS"],
    ["gateway", "frontend", "Routing"], ["frontend", "api", "API Requests"],
    ["api", "database", "ORM / SQL"], ["api", "cache", "Reads / Writes"],
    ["api", "auth", "Authentication"],
  ].map(([source, target, label], index) => ({ id: `edge-${index}`, source, target, label })),
};
const artifact = {
  id: "arc", projectId: "project", kind: "architecture", code: "ARC-001", title: "Next.js & FastAPI 풀스택 아키텍처",
  status: "초안", version: 1, fields: { definition: "웹 · 모바일 클라이언트와 API 서버, 데이터 계층 및 외부 인증 서비스 구성", owner: "설계 담당자", frameworks: "Next.js / FastAPI", servers: "Nginx", database: "PostgreSQL" },
  structure: { topology }, links: [], createdAt: "", updatedAt: "",
};
assert.deepEqual(validateTopology(topology), topology);
for (const invalid of [
  { ...topology, nodes: [...topology.nodes, topology.nodes[0]] },
  { ...topology, nodes: [{ ...topology.nodes[0], layer: "invalid" }] },
  { ...topology, nodes: [{ ...topology.nodes[0], shape: "invalid" }] },
  { ...topology, edges: [{ ...topology.edges[0], target: "missing" }] },
  { ...topology, edges: [{ ...topology.edges[0], target: "browser" }] },
  { ...topology, edges: [topology.edges[0], topology.edges[0]] },
  { nodes: Array(31).fill(topology.nodes[0]), edges: [] },
  { nodes: [], edges: Array(61).fill(topology.edges[0]) },
]) assert.throws(() => validateTopology(invalid));
const legacy = { ...artifact, structure: undefined };
assert.equal(topologyFor(legacy).nodes.length, 3);
assert.equal(topologyFor(legacy).edges.length, 0);
assert.deepEqual(prepareStructure(artifact, {}, [artifact], artifact.structure).topology, topology);
assert.deepEqual(prepareStructure(artifact, { structure: { topology: { nodes: [], edges: [] } } }, [artifact], artifact.structure).topology, { nodes: [], edges: [] });
assert.throws(() => prepareStructure(artifact, { structure: { topology: { nodes: [], edges: topology.edges } } }, [artifact]));
const layout = architectureLayout(artifact);
assert.equal(layout.nodes.length, topology.nodes.length);
assert.equal(layout.edges.length, topology.edges.length);
for (const node of layout.nodes) assert.ok(node.x >= 0 && node.x + node.width <= layout.width && node.y + node.height < layout.height);
const long = architectureLayout({ ...artifact, structure: { topology: { nodes: Array.from({ length: 7 }, (_, i) => ({ ...topology.nodes[0], id: String(i), technology: "긴 설명 ".repeat(300) })), edges: [] } } });
for (let i = 0; i < long.nodes.length; i++) for (let j = i + 1; j < long.nodes.length; j++) {
  const a = long.nodes[i], b = long.nodes[j];
  assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}
console.log("PASS: topology validation, saved diagram preservation, legacy fallback and long-label layout");

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ArchitectureDiagramSvg } = load(resolve("components/pages/architecture/architecture-diagram-svg.tsx"));
const svg = renderToStaticMarkup(React.createElement(ArchitectureDiagramSvg, { artifact }));
assert.ok(svg.includes("<marker") && svg.includes("<ellipse") && svg.includes("INFRASTRUCTURE"));
assert.ok(!svg.includes("foreignObject") && !svg.includes("var(--"));
const renderFolder = await mkdtemp(join(tmpdir(), "matrix-architecture-render-"));
writeFileSync(join(renderFolder, "diagram.svg"), svg);
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
await sharp(Buffer.from(svg)).png().toFile(join(renderFolder, "diagram.png"));
console.log(`PASS: SVG rendering and PNG rasterization (${join(renderFolder, "diagram.png")})`);
