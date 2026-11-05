import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createRequire} from "node:module";
import ts from "typescript";
import {renderToStaticMarkup} from "react-dom/server";
const require=createRequire(import.meta.url),cache=new Map(),writes=[];
let context;
function load(file){
  if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const code=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require","module","exports",code)(name=>{
    if(name==="react"&&file.endsWith("use-wbs-schedule.ts"))return {useState:initial=>[typeof initial==="function"?initial():initial,value=>writes.push(value)],useMemo:fn=>fn(),useRef:value=>({current:value}),useEffect:()=>{}};
    if(name==="@/components/shared/project-page-context")return {useProjectPage:()=>context};
    if(!name.startsWith(".")&&!name.startsWith("@/"))return require(name);
    const base=name.startsWith("@/")?resolve(name.slice(2)):resolve(dirname(file),name);
    return load([base,base+".ts",base+".tsx"].find(existsSync));
  },module,module.exports);
  return module.exports;
}
const {WbsOverview}=load(resolve("components/pages/wbs/wbs-overview.tsx"));
const widths=[];
for(const viewMode of ["Day","Week","Month"]){
  const html=renderToStaticMarkup(WbsOverview({tasks:[],start:"2026-11-01",days:92,expanded:true,viewMode}));
  assert.ok(html.includes(`data-view-mode="${viewMode}"`));
  widths.push(Number(html.match(/width="([\d.]+)"/)[1]));
  const labels=html.split('data-layer="labels"')[1];
  if(viewMode==="Day")assert.ok(labels.includes("11/02"));
  if(viewMode==="Week"){assert.ok(labels.includes("11/08 주"));assert.ok(!labels.includes("11/02"));}
  if(viewMode==="Month"){assert.ok(labels.includes("2026-12"));assert.ok(!labels.includes("11/02"));}
}
assert.ok(widths[0]>widths[1]&&widths[1]>=widths[2]);
const parent={id:"parent",kind:"wbs",code:"WBS-001",title:"Parent",fields:{taskType:"요약",startDate:"2026-11-10",endDate:"2026-12-20",progress:"0"},structure:{parentId:""},version:1};
context={data:{project:{id:"p"},artifacts:[parent]},artifacts:[parent],can:()=>true};
const {useWbsSchedule}=load(resolve("components/pages/wbs/use-wbs-schedule.ts"));
const model=useWbsSchedule();model.openTask("parent");
const child=writes.find(value=>value?.id?.startsWith("temp-"));
assert.equal(child.fields.startDate,parent.fields.startDate);assert.equal(child.fields.endDate,parent.fields.endDate);
assert.equal(child.structure.parentId,"parent");
model.applyTask({...child,title:"Child",fields:{...child.fields,startDate:"2026-11-12",endDate:"2026-12-10"}});
assert.ok(writes.some(value=>Array.isArray(value)&&value.some(task=>task.id===child.id&&task.fields.startDate==="2026-11-12"&&task.fields.endDate==="2026-12-10")));
console.log("PASS WBS view: day/week/month overview labels and scale; parent date defaults and editable child dates.");
