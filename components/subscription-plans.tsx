"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Plan } from "@/lib/plan-types";
const amount = (v: number | null) => v === null ? "등록 예정" : `${v.toLocaleString("ko-KR")}원`;
const limit = (v: number | null) => v === null ? "무제한" : v.toLocaleString("ko-KR");
export function SubscriptionPlans({plans,current,usage,readOnly=false}:{plans:Plan[];current?:Plan;usage?:Record<string,number>;readOnly?:boolean}) {
 const router=useRouter(), dialog=useRef<HTMLDialogElement>(null), submitting=useRef(false);
 const [selected,setSelected]=useState<Plan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function changePlan(){
  if(!selected || !current || readOnly || submitting.current)return;
  submitting.current=true;setBusy(true);setError("");
  try{
   const response=await fetch('/api/me/subscription',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:selected.code,currentPlan:current.code,planVersion:selected.version})});
   const result=await response.json();if(!response.ok)throw new Error(result.error??'요금제를 변경하지 못했습니다.');
   dialog.current?.close();setNotice(`${selected.name} 요금제로 변경되었습니다.`);setSelected(null);router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'요금제를 변경하지 못했습니다.');}finally{submitting.current=false;setBusy(false);}
 }
 return <section><h1>요금제</h1><p>{current?`현재 ${current.name} 플랜 · `:''}모든 요금은 원 단위입니다.</p>
 {current&&usage&&<div className="panel" style={{padding:20,marginBottom:20,lineHeight:2}}>프로젝트 {usage.projects} / {limit(current.projectLimit)} · 토큰 {usage.tokens.toLocaleString('ko-KR')} / {limit(current.tokenLimit)} · 일일 이미지 {usage.images} / {limit(current.dailyImageLimit)}</div>}
 <p className="muted">연간 가격은 별도로 책정됩니다. 총 토큰은 자동 갱신되지 않습니다.</p>
 <p className="muted">{readOnly?'게스트는 요금제를 조회만 할 수 있습니다.':'현재 결제 시스템이 연결되어 있지 않습니다. 결재 버튼을 누르면 실제 청구 없이 요금제가 즉시 변경됩니다.'}</p>
 {notice&&<p role="status">{notice}</p>}
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:16}}>{plans.map(plan=><article key={plan.code} className="panel" style={{padding:24,borderColor:plan.recommended?'var(--primary)':undefined}}>
 {plan.recommended&&<span className="badge purple">추천</span>}<h2 style={{marginTop:12}}>{plan.name}</h2><p>월간 <strong>{plan.priceMode==='contact'?'협의':amount(plan.monthlyPrice)}</strong></p><p>연간 {plan.priceMode==='contact'?'협의':amount(plan.yearlyPrice)}</p>
 <ul style={{paddingLeft:18,lineHeight:2.2}}><li>프로젝트 {limit(plan.projectLimit)}개</li><li>총 토큰 {limit(plan.tokenLimit)}{plan.code==='business'&&' · 사용량 과금'}</li><li>일일 이미지 {limit(plan.dailyImageLimit)}개</li><li>프롬프트 이미지 {plan.attachmentLimit}개</li><li>이력 {plan.historyEnabled?'생성':'미생성'}</li></ul>
 {current?.code===plan.code?<span className="badge purple">이용 중</span>:!readOnly&&<label style={{display:'flex',gap:8}}><input type="radio" name="subscription-plan" checked={selected?.code===plan.code} disabled={busy} onChange={()=>{setSelected(plan);setNotice('');}}/>{plan.name} 선택</label>}
 </article>)}</div>
 {!readOnly&&<button className="button primary" style={{marginTop:20}} disabled={!selected||busy} onClick={()=>{setError('');dialog.current?.showModal();}}>요금제변경</button>}
 <dialog ref={dialog} className="workspace-dialog" aria-labelledby="subscription-confirm-title" onCancel={e=>{if(busy)e.preventDefault();}}><div style={{padding:24}}><h2 id="subscription-confirm-title">{selected?.name} 요금제로 변경 하시겠습니까?</h2><p>실제 결제나 청구 없이 선택한 요금제로 변경됩니다.</p>{error&&<p role="alert">{error}</p>}<div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:20}}><button className="button" disabled={busy} onClick={()=>dialog.current?.close()}>취소</button><button className="button primary" disabled={busy} onClick={changePlan}>{busy?'변경 중…':'결재'}</button></div></div></dialog>
 </section>;
}
