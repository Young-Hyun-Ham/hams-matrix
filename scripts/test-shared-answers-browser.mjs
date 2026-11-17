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
const folder = mkdtempSync(join(tmpdir(), "matrix-shared-browser-"));
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
  const raw = override ?? readFileSync(file, "utf8");
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
    if (name === "@/stores/workspace")
      item.dependencies[name] = bundle(
        "store-stub",
        "exports.useWorkspace={getState:()=>({updateAiConversation(){},refreshAiConversations(){}})}",
      );
    else if (name === "./ai-image-preview")
      item.dependencies[name] = bundle(
        "image-stub",
        "exports.AiImagePreview=()=>null",
      );
    else {
      const base = name.startsWith("@/")
        ? resolve(name.slice(2))
        : resolve(dirname(file), name);
      const target =
        production[name] ??
        (name.startsWith(".") || name.startsWith("@/")
          ? [base, base + ".ts", base + ".tsx"].find(existsSync)
          : require.resolve(name, { paths: [dirname(file)] }));
      if (!target) throw new Error(name);
      item.dependencies[name] = bundle(target);
    }
  }
  return id;
}
const fixture = String.raw`
const React=require('react'),{createRoot}=require('react-dom/client');
const {QueryClient,QueryClientProvider}=require('@tanstack/react-query');
const {SharedAnswerControls}=require('@/components/ai/shared-answer-dialog');
const {SharedAnswerCandidates}=require('@/components/ai/shared-answer-candidates');
const h=React.createElement,pause=ms=>new Promise(r=>setTimeout(r,ms));
const check=(value,label)=>{if(!value)throw new Error(label)};
async function waitFor(test,label){for(let n=0;n<150;n++){if(test())return;await pause(20)}throw new Error('Timeout: '+label)}
const answer={id:'shared-1',version:1,answerVersion:1,status:'pending_review',question:'REQ-001 approval criteria',aliases:['REQ-001 approval criteria'],contract:{conditions:'Only the reviewed project document',temporal:'none'},result:'Immutable original answer.\nSecond line.',originallyAnsweredAt:'2026-11-17T00:00:00Z',createdAt:'2026-11-17T00:00:00Z',evidence:[{type:'artifact',id:'a1',title:'Reviewed requirement',version:'1',href:'/projects/p?tab=requirement'}],stale:false,canReview:true,canRevoke:true};
window.calls=[];let registered=false,fresh=0,stale=false;
window.fetch=async (url,init={})=>{
 window.calls.push({url,method:init.method||'GET',body:init.body?JSON.parse(init.body):null});
 if(init.method==='POST'){
  const body=JSON.parse(init.body);
  if(url.endsWith('/review')){check(body.expectedVersion===answer.version,'Review must carry version');check(body.confirmPublic&&body.confirmConditions,'Review must confirm privacy and conditions');answer.status='active';answer.version++}
  else if(url.endsWith('/revoke')){answer.status='revoked';answer.version++}
  else {check(body.chatId==='chat-1','Registration uses server chat ID');check(!('result' in body),'Client must not submit answer content');check(body.confirmPublic&&body.idempotencyKey,'Explicit registration confirmation and idempotency');registered=true}
  await pause(30);return Response.json({id:answer.id});
 }
 if(url.endsWith('/shared-1'))return stale?Response.json({error:'Evidence changed'},{status:409}):Response.json(answer);
 return Response.json({answers:registered?[answer]:[],canReview:true,canRegister:true});
};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
function App(){return h(QueryClientProvider,{client},h('main',null,
 h(SharedAnswerControls,{projectId:'p',chat:{id:'chat-1',prompt:answer.question,result:answer.result,shareEligibility:{eligible:true}}}),
 h(SharedAnswerControls,{projectId:'p'}),
 h(SharedAnswerCandidates,{projectId:'p',candidates:[answer],generateFresh:()=>fresh++,disabled:false})
))}
function button(text,root=document){return [...root.querySelectorAll('button')].find(e=>e.textContent.trim()===text)}
function setText(element,value){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}))}
createRoot(document.getElementById('root')).render(h(App));
(async()=>{
 await waitFor(()=>document.querySelector('button'),'mounted');
 button('\uacf5\uc720 \ub2f5\ubcc0\uc73c\ub85c \ub4f1\ub85d').click();
 await waitFor(()=>document.querySelector('dialog[open]'),'register dialog');
 const dialog=()=>document.querySelector('dialog[open]');
 check(button('\ub4f1\ub85d \uc694\uccad',dialog()).disabled,'Must not register without confirmation and conditions');
 setText(dialog().querySelectorAll('textarea')[0],'Only reviewed document');
 setText(dialog().querySelectorAll('textarea')[1],'REQ-001 approval criteria');
 dialog().querySelector('input[type=checkbox]').click();
 await waitFor(()=>!button('\ub4f1\ub85d \uc694\uccad',dialog()).disabled,'registration ready');
 button('\ub4f1\ub85d \uc694\uccad',dialog()).click();
 await waitFor(()=>registered&&!!dialog().querySelector('[role=status]'),'registration complete');
 check(window.calls.filter(c=>c.method==='POST').length===1,'No duplicate registration');
 button('\ub2eb\uae30',dialog()).click();await waitFor(()=>!dialog(),'closed dialog');
 button('\uacf5\uc720 \ub2f5\ubcc0 \uad00\ub9ac').click();
 await waitFor(()=>dialog()&&dialog().querySelector('article'),'management list');
 check(button('\uc2b9\uc778',dialog()).disabled,'Approval requires explicit review');
 dialog().querySelector('summary').click();dialog().querySelector('input[type=checkbox]').click();
 await waitFor(()=>!button('\uc2b9\uc778',dialog()).disabled,'review confirmed');button('\uc2b9\uc778',dialog()).click();
 await waitFor(()=>answer.status==='active'&&!button('\uc2b9\uc778',dialog()),'approved');
 button('\ub2eb\uae30',dialog()).click();await waitFor(()=>!dialog(),'closed dialog');
 button('\uacf5\uc720 \ub2f5\ubcc0 \uc5f4\uc5b4\ubcf4\uae30').click();
 await waitFor(()=>dialog()&&dialog().querySelector('pre'),'preview');
 check(dialog().querySelector('pre').textContent===answer.result,'Preview preserves exact original including newline');
 button('\ub2eb\uae30',dialog()).click();await waitFor(()=>!dialog(),'closed dialog');
 stale=true;button('\uacf5\uc720 \ub2f5\ubcc0 \uc5f4\uc5b4\ubcf4\uae30').click();
 await waitFor(()=>dialog()&&dialog().querySelector('[role=alert]'),'stale evidence denial');
 check(!dialog().querySelector('pre'),'Failed revalidation must not keep cached private body');
 button('\ub2eb\uae30',dialog()).click();await waitFor(()=>!dialog(),'closed dialog');button('\uc0c8 \ub2f5\ubcc0 \uc0dd\uc131').click();check(fresh===1,'Explicit fresh answer continuation');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',checks:'registration confirmation, original server chat ID, idempotency, review gating/version, exact original preview, stale evidence cache denial, explicit fresh continuation',requests:window.calls.length});
})().catch(error=>{document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:error.stack,calls:window.calls})});
`;
const entry = bundle(resolve("shared-browser-fixture.js"), fixture);
const code = `const process={env:{NODE_ENV:'production'}};const modules=${JSON.stringify(modules)};const cache={};function load(id){if(cache[id])return cache[id].exports;const item=modules[id],module={exports:{}};cache[id]=module;new Function('require','module','exports',item.source)(name=>load(item.dependencies[name]),module,module.exports);return module.exports}load(${entry});`;
const css = ["styles/globals.css", "styles/ai-chatbot.css"]
  .map((file) => readFileSync(file, "utf8").replace(/@import[^;]+;/g, ""))
  .join("\n");
writeFileSync(join(folder, "fixture.js"), code);
writeFileSync(
  join(folder, "index.html"),
  `<!doctype html><meta charset="utf-8"><style>${css}\nbody{padding:20px}#root{width:460px}.matrix-ai-messages{height:320px;max-height:320px}#report{white-space:pre-wrap}</style><div id="root"></div><pre id="report">pending</pre><script src="fixture.js"></script>`,
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
console.log(
  `PASS shared answers browser: ${result.checks}. Evidence: ${folder}`,
);
