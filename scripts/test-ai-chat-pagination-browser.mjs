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
const folder = mkdtempSync(join(tmpdir(), "matrix-chat-scroll-"));
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
          : require.resolve(name));
      if (!target) throw new Error(name);
      item.dependencies[name] = bundle(target);
    }
  }
  return id;
}
const fixture = String.raw`
const React=require('react'),{createRoot}=require('react-dom/client');
const {useAiConversation}=require('@/components/ai/use-ai-conversation');
const {AiConversationMessages}=require('@/components/ai/ai-conversation-messages');
const h=React.createElement,pause=ms=>new Promise(r=>setTimeout(r,ms));
const rows={a:Array.from({length:25},(_,i)=>chat('a',i+1)),b:Array.from({length:5},(_,i)=>chat('b',i+1)),empty:[]};
function chat(room,n){return {id:room+'-'+n,convId:room,prompt:'Question '+n,result:('Answer '+n+' ').repeat(35),model:'test',screenTitle:'Test',createdAt:'2026-11-10T00:00:00Z',index:n}}
window.calls=[];window.failOlder=false;window.delay=80;
window.fetch=async url=>{
 const query=new URL(url,'http://test.local').searchParams,id=query.get('convId'),before=query.get('before');
 window.calls.push({id,before});
 if(before)await pause(window.delay); // Deliberately ignores AbortSignal to test stale-response guards.
 if(before&&window.failOlder){window.failOlder=false;return Response.json({error:'Retry older page'},{status:500})}
 const available=rows[id].filter(c=>!before||c.index<Number(before)),chats=available.slice(-10);
 return Response.json({chats,nextCursor:available.length>10?String(chats[0].index):null,historyEnabled:true,conversation:{convId:id,projectId:'',title:id}});
};
function Room({id}){
 const [open,setOpen]=React.useState(true);
 const state=useAiConversation({convId:id,projectId:'',title:id},open);
 window.session={id,state,setOpen,append(){const c=chat(id,rows[id].length+1);rows[id].push(c);state.append(c);return c.id}};
 return h(AiConversationMessages,{conversation:state,generating:false,showResult(){},reuse(){}});
}
function App(){const [room,setRoom]=React.useState('a');window.changeRoom=setRoom;return h(Room,{id:room,key:room})}
const check=(value,label)=>{if(!value)throw new Error(label)};
async function waitFor(test,label){for(let n=0;n<150;n++){if(test())return;await pause(20)}throw new Error('Timeout: '+label)}
const list=()=>document.querySelector('.matrix-ai-messages');
const count=()=>document.querySelectorAll('[data-chat-id]').length;
const atBottom=()=>list().scrollHeight-list().clientHeight-list().scrollTop<=2;
const top=element=>element.getBoundingClientRect().top-list().getBoundingClientRect().top;
function upward(){list().scrollTop=0;list().dispatchEvent(new Event('scroll'));list().dispatchEvent(new WheelEvent('wheel',{deltaY:-40,bubbles:true}))}
createRoot(document.getElementById('root')).render(h(App));
(async()=>{
 await waitFor(()=>window.session&&!window.session.state.loading&&count()===10,'latest ten');
 check(atBottom(),'Initial position must be the bottom');
 check(window.calls.length===1,'Initial load must not drain older pages');
 list().scrollTop=0;const anchor=document.querySelector('[data-chat-id]');
 upward();upward();upward();
 await waitFor(()=>window.session.state.loadingOlder,'page request in progress');
 list().scrollTop=40;list().dispatchEvent(new Event('scroll'));const offset=top(anchor);
 await waitFor(()=>count()===20&&!window.session.state.loadingOlder,'first older page');
 check(window.calls.length===2,'Repeated scroll events must share one request');
 check(Math.abs(top(anchor)-offset)<2,'Prepending must preserve the visible message position');
 check(list().scrollTop>0,'Prepending must not leave the user at the new beginning');
 window.failOlder=true;upward();
 await waitFor(()=>!!window.session.state.olderError,'older error');
 check(count()===20,'Older-page failure must preserve existing messages');
 const beforeRetry=window.calls.length;upward();await pause(120);
 check(window.calls.length===beforeRetry,'Failed page must not auto-retry in a loop');
 document.querySelector('.matrix-ai-older').click();
 await waitFor(()=>count()===25&&!window.session.state.loadingOlder,'last five');
 check(!window.session.state.nextCursor,'Exhausted history must have no next cursor');
 check(new Set([...document.querySelectorAll('[data-chat-id]')].map(e=>e.dataset.chatId)).size===25,'No repeated messages');
 const exhausted=window.calls.length;upward();await pause(120);check(window.calls.length===exhausted,'Do not request after exhaustion');
 window.session.append();await waitFor(()=>count()===26&&atBottom(),'new answer at bottom');
 const loaded=window.session.state.loadedVersion;window.session.setOpen(false);await pause(40);window.session.setOpen(true);
 await waitFor(()=>window.session.state.loadedVersion>loaded&&count()===10,'reopen latest page');
 check(atBottom(),'Reopening must return to the bottom');
 window.delay=200;upward();await waitFor(()=>window.session.state.loadingOlder,'pending old room');
 window.changeRoom('b');await waitFor(()=>window.session.id==='b'&&count()===5,'different room');await pause(250);
 check([...document.querySelectorAll('[data-chat-id]')].every(e=>e.dataset.chatId.startsWith('b-')),'Late response must not mix rooms');
 window.changeRoom('empty');await waitFor(()=>window.session.id==='empty'&&!window.session.state.loading,'empty room');
 check(count()===0&&!!document.querySelector('.matrix-ai-empty'),'Empty room must render normally');
 document.getElementById('report').textContent=JSON.stringify({status:'PASS',requests:window.calls.length,checks:'latest ten, initial bottom, automatic older ten, anchor preservation, duplicate prevention, failure retention/manual retry, final five, exhaustion, append, reopen, stale room response, empty room'});
})().catch(error=>{document.getElementById('report').textContent=JSON.stringify({status:'FAIL',error:error.stack,calls:window.calls})});
`;
const entry = bundle(resolve("chat-scroll-fixture.js"), fixture);
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
  `PASS chat pagination browser: ${result.checks}. Evidence: ${folder}`,
);
