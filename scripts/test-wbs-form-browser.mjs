// Hydrated production React hook/component in headless Chrome; only fetch, the
// workspace notification store and Next's image renderer are replaced. No DB/AI.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const domRequire = createRequire(require.resolve("react-dom/client"));
const folder = mkdtempSync(join(tmpdir(), "matrix-wbs-form-"));
const modules = [],
  ids = new Map();
const production = {
  react: join(dirname(require.resolve("react")), "cjs/react.production.js"),
  "react/jsx-runtime": join(
    dirname(require.resolve("react")),
    "cjs/react-jsx-runtime.production.js",
  ),
  "react-dom": join(
    dirname(require.resolve("react-dom")),
    "cjs/react-dom.production.js",
  ),
  "react-dom/client": join(
    dirname(require.resolve("react-dom/client")),
    "cjs/react-dom-client.production.js",
  ),
  scheduler: join(
    dirname(domRequire.resolve("scheduler")),
    "cjs/scheduler.production.js",
  ),
};
function bundle(file, override) {
  if (ids.has(file)) return ids.get(file);
  const id = modules.length;
  ids.set(file, id);
  const item = { source: "", dependencies: {} };
  modules.push(item);
  const raw = file.endsWith(".css")
    ? ""
    : (override ?? readFileSync(file, "utf8"));
  item.source = /\.tsx?$/.test(file)
    ? ts.transpileModule(raw, {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText
    : raw;
  for (const match of item.source.matchAll(/require\(["']([^"']+)["']\)/g)) {
    const name = match[1];
    const stubs = {
      "lucide-react": "exports.CalendarDays=()=>null",
      "@/components/shared/project-page-context":
        "exports.useProjectPage=()=>({})",
      "./project-page-context": "exports.useProjectPage=()=>({})",
      "@/lib/database-relations": "exports.databaseDeleteReason=()=>''",
      "@/lib/integration":
        "exports.referencesFor=()=>[];exports.taskMetrics=()=>({})",
      "./integration":
        "exports.referencesFor=()=>[];exports.taskMetrics=()=>({})",
      "@/lib/client-request":
        "exports.jsonRequest=async()=>{window.apiCalls++;throw new Error('Repeated server error')}",
      "@/components/artifact-fields":
        "exports.ArtifactFields=p=>require('react').createElement(require('@/components/pages/wbs/wbs-fields').WbsFields,{...p,calendarOnly:true})",
      "./artifact-structure-editor":
        "exports.StructureEditor=require('@/components/pages/wbs/wbs-structure-editor').WbsStructureEditor",
    };
    if (stubs[name])
      item.dependencies[name] = bundle("stub-" + name, stubs[name]);
    else {
      const base = name.startsWith("@/")
        ? resolve(name.slice(2))
        : resolve(dirname(file), name);
      const target =
        production[name] ??
        (name.startsWith(".") || name.startsWith("@/")
          ? [base, base + ".ts", base + ".tsx"].find(existsSync)
          : require.resolve(name));
      if (!target) throw new Error(name);
      item.dependencies[name] = bundle(target);
    }
  }
  return id;
}
const fixture = String.raw`
const React=require('react'),{createRoot}=require('react-dom/client');
const {ArtifactDialogContent}=require('@/components/shared/artifact-dialogs');
const {useArtifactActions}=require('@/components/shared/use-artifact-actions');
const {wbsDateConstraints,adjustPlannedDates,validateWbsDates}=require('@/lib/wbs-date-constraints');
const h=React.createElement,pause=ms=>new Promise(r=>setTimeout(r,ms));
const task=(id,type,start,end,structure={})=>({id,kind:'wbs',code:id,title:id||'New task',status:'초안',version:1,links:[],fields:{taskType:type,phase:'개발',startDate:start,endDate:end,definition:'개발 범위',plannedEffort:'0',actualEffort:'0',progress:'0',actualStart:'',actualEnd:''},structure});
const parent=task('parent','요약','2026-11-10','2026-11-30'),pred=task('pred','작업','2026-11-10','2026-11-12');
const draft=task('','작업','2026-11-20','2026-11-20');
let artifacts=[parent,pred];window.apiCalls=0;window.confirm=()=>{window.confirmed=true;return true};
function App(){const actions=useArtifactActions('p',()=>{},async()=>true);window.actions=actions;return h(ArtifactDialogContent,{projectId:'p',actions,onReload(){},artifacts,can:()=>true})}
const check=(v,m)=>{if(!v)throw new Error(m)};
async function waitFor(fn,m){for(let i=0;i<100;i++){if(fn())return;await pause(20)}throw new Error('Timeout '+m)}
createRoot(document.getElementById('root')).render(h(App));
(async()=>{
 await waitFor(()=>window.actions,'render');window.actions.openCreate('wbs',draft);
 await waitFor(()=>document.querySelector('dialog[open]'),'open');
 const form=document.querySelector('form'),body=form.querySelector('.admin-detail-body'),select=form.querySelector('[name=parentId]');
 select.value='parent';select.dispatchEvent(new Event('change',{bubbles:true}));await pause(30);
 check(form.querySelector('[name=startDate]').value==='2026-11-10','initial date follows parent earliest');
 form.querySelector('[name=dependencies]').click();await pause(30);
 check(form.querySelector('[name=startDate]').value==='2026-11-12','predecessor same day lower bound');
 check(!form.querySelector('[name=actualStart]').value,'do not invent actual dates');
 const trigger=form.querySelector('[aria-label="계획 시작일 달력 열기"]');trigger.click();await pause(30);
 const cal=document.querySelector('.wbs-calendar-dialog[open]');
 check(cal.querySelector('[aria-label="2026-11-11"]').disabled,'date below lower bound disabled');
 check(!cal.querySelector('[aria-label="2026-11-12"]').disabled,'boundary selectable');
 check(cal.querySelector('[aria-label="이전 달"]').disabled,'month below bound disabled');
 const boundary=cal.querySelector('[aria-label="2026-11-12"]');boundary.focus();boundary.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await pause(20);check(document.activeElement===boundary,'keyboard cannot cross minimum');
 boundary.click();await pause(30);
 await waitFor(()=>document.activeElement===trigger,'calendar close returns focus');
 const submit=form.querySelector('[type=submit]');submit.click();await waitFor(()=>document.activeElement.id==='wbs-save-error','server error focus');
 check(window.apiCalls===1,'server called once');check(body.scrollTop>0,'modal body scrolled');
 const error=document.activeElement,rect=error.getBoundingClientRect(),br=body.getBoundingClientRect();check(rect.top>=br.top&&rect.top<br.bottom,'error visible');
 body.scrollTop=0;submit.focus();submit.click();await waitFor(()=>window.apiCalls===2&&document.activeElement.id==='wbs-save-error','identical error focus again');
 const title=form.querySelector('[name=title]');title.value='';submit.click();await pause(30);
 check(window.apiCalls===2&&document.activeElement.id==='wbs-save-error','native invalid goes to footer without API');
 check(form.querySelector('[name=dependencies]').checked,'relations retained after errors');
 form.querySelector('.admin-detail-close').click();check(window.confirmed,'calendar and relation changes mark form dirty');await pause(30);window.actions.openCreate('wbs',draft);await pause(30);
 check(!form.isConnected,'fresh form on session reopen');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',checks:'relation autofill, same-day boundary, actual preservation, disabled days/month, nested focus return, API error focus and inner scroll, identical retry, native validation, input retention, fresh session'});
})().catch(error=>document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:error.stack}));
`;
const entry = bundle(resolve("wbs-form-fixture.js"), fixture);
const code = `const process={env:{NODE_ENV:'production'}};const modules=${JSON.stringify(modules)};const cache={};function load(id){if(cache[id])return cache[id].exports;const item=modules[id],module={exports:{}};cache[id]=module;new Function('require','module','exports',item.source)(name=>load(item.dependencies[name]),module,module.exports);return module.exports}load(${entry});`;
const css = ["styles/dialog.css", "styles/pages/projects/tabs/wbs/wbs-date-picker.css"]
  .map((file) => readFileSync(file, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
writeFileSync(join(folder, "fixture.js"), code);
writeFileSync(
  join(folder, "index.html"),
  `<!doctype html><meta charset="utf-8"><style>${css}\nbody{padding:20px} .project-registration-dialog{height:500px;width:600px} .project-registration-dialog form{height:100%;display:flex;flex-direction:column;overflow:hidden}.project-registration-body{flex:1;overflow:auto;min-height:0}.matrix-field{display:block;margin:15px}fieldset{min-width:0} .project-registration-footer{flex-shrink:0}#report{white-space:pre-wrap}</style><div id="root"></div><pre id="report">pending</pre><script src="fixture.js"></script>`,
);
const output = execFileSync(
  process.env.MATRIX_TEST_BROWSER ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--allow-file-access-from-files",
    "--virtual-time-budget=15000",
    "--timeout=20000",
    `--user-data-dir=${join(folder, "profile")}`,
    `--screenshot=${join(folder, "preview.png")}`,
    "--dump-dom",
    pathToFileURL(join(folder, "index.html")).href,
  ],
  {
    encoding: "utf8",
    timeout: 45000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const report = output.match(/<pre id="report">([^<]+)<\/pre>/)?.[1];
assert.ok(
  report && report !== "pending",
  `Browser fixture did not finish: ${folder}`,
);
const result = JSON.parse(
  report
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&"),
);
assert.equal(result.status, "PASS", JSON.stringify(result));
console.log(`PASS WBS form browser: ${result.checks}. Evidence: ${folder}`);
