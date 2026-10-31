// Local, synthetic browser fixture: real Mermaid + the production SVG cleanup
// and contrast correction, without credentials, a live DB or paid AI requests.
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import ts from "typescript";
const require = createRequire(import.meta.url);
const folder = await mkdtemp(join(tmpdir(), "matrix-mermaid-editor-"));
const helper = ts.transpileModule(readFileSync("components/pages/architecture/mermaid-preview.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
await writeFile(join(folder, "helper.mjs"), helper);
const mermaidUrl = pathToFileURL(join(dirname(require.resolve("mermaid")), "mermaid.esm.min.mjs")).href;
const code = 'graph TD\n %% node styles\n classDef client fill:#e1f5fe,stroke:#0288d1,color:#fff;\n classDef db fill:#fff3e0,stroke:#f57c00,color:#fff;\n subgraph ClientLayer ["1. Client Layer"]\n Browser["Web Browser (React/Next.js)"]:::client\n Mobile["Mobile Web App"]:::client\n end\n subgraph AppLayer ["2. Application and API Layer"]\n API["FastAPI Engine (Python)"]\n end\n Browser -->|HTTPS / JSON| API\n Mobile --> API\n API -->|ORM / SQL| DB[("PostgreSQL DB")]:::db';
const css = readFileSync("components/pages/architecture/architecture-page.css", "utf8");
await writeFile(join(folder, "test.html"), `<!doctype html><html><head><meta charset="utf-8"><style>:root{--canvas:#181821;--surface:#22222e;--ink:#e7e7f0;--muted:#a6a5bb;--line:#343344;--primary:#a48bfa;--primary-soft:#302744}body{margin:20px;background:var(--canvas);color:var(--ink);font:14px Arial}.matrix-architecture-mermaid-preview{height:700px}${css}</style></head><body><div class="matrix-workbench"><h2>Mermaid preview · dark theme with custom light nodes</h2><div class="matrix-architecture-mermaid-preview"><div class="architecture-preview-space"><div id="canvas" class="architecture-preview-canvas"></div></div></div></div><script type="module">
import mermaid from ${JSON.stringify(mermaidUrl)};
import {safeMermaidSvg,readableMermaidLabels} from './helper.mjs';
try { mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',htmlLabels:false,themeVariables:{darkMode:true,primaryColor:'#302744',primaryTextColor:'#e7e7f0',textColor:'#e7e7f0',lineColor:'#aaa6c3',clusterBkg:'#181821',clusterBorder:'#69677e',edgeLabelBackground:'#22222e'},flowchart:{htmlLabels:false,useMaxWidth:false}});
const code=${JSON.stringify(code)};await mermaid.parse(code);const result=await mermaid.render('actualPreview',code,document.getElementById('canvas'));document.getElementById('canvas').innerHTML=safeMermaidSvg(result.svg);const svg=document.querySelector('svg');readableMermaidLabels(svg,'#e7e7f0');window.testResult={nodes:svg.querySelectorAll('g.node').length,foreign:svg.querySelectorAll('foreignObject').length,labels:[...svg.querySelectorAll('g.node text')].map(text=>({text:text.textContent,fill:getComputedStyle(text).fill})),width:svg.viewBox.baseVal.width,height:svg.viewBox.baseVal.height}; }catch(error){window.testResult={error:String(error)}}
</script></body></html>`);
const browser = process.env.MERMAID_TEST_BROWSER || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const child = spawn(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files", `--user-data-dir=${join(folder, "profile")}`, "--remote-debugging-port=0", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
let socket, lastError = "";
child.stderr.on("data", (data) => { lastError = String(data).slice(0, 1000); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await readFile(join(folder, "profile", "DevToolsActivePort"), "utf8")).split("\n"); break; } catch { await sleep(100); }
  }
  assert.ok(port, `Chrome did not start: ${lastError}`);
  socket = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  socket.onmessage = (event) => { const message = JSON.parse(event.data); const item = pending.get(message.id); if (item) { pending.delete(message.id); if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result); } };
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await call("Target.createTarget", { url: pathToFileURL(join(folder, "test.html")).href });
  const { sessionId } = await call("Target.attachToTarget", { targetId, flatten: true });
  await call("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  let result;
  for (let attempt = 0; attempt < 100; attempt++) {
    result = (await call("Runtime.evaluate", { expression: "window.testResult", returnByValue: true }, sessionId)).result?.value;
    if (result) break;
    await sleep(100);
  }
  assert.ok(result && !result.error, JSON.stringify(result));
  assert.equal(result.nodes, 4);
  assert.equal(result.foreign, 0);
  assert.ok(result.width > 0 && result.height > 0);
  assert.ok(result.labels.some((label) => label.text.includes("Browser") && label.fill === "rgb(23, 32, 51)"), JSON.stringify(result));
  const screenshot = await call("Page.captureScreenshot", { format: "png" }, sessionId);
  const path = resolve(folder, "preview.png");
  await writeFile(path, Buffer.from(screenshot.data, "base64"));
  console.log(`PASS: real browser graph/classDef/subgraph rendering, native SVG text, readable custom light nodes in dark theme. Screenshot: ${path}`);
  await call("Browser.close").catch(() => {});
} finally { socket?.close(); child.kill(); }
