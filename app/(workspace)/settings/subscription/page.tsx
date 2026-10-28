import { requireUser } from "@/lib/auth";
import { listPlans, memberPlan } from "@/lib/plans";
import { quotaUsage } from "@/lib/quotas";
export default async function SubscriptionPage() {
  const user = await requireUser(); const current = await memberPlan(user.id); const plans = await listPlans();
  const usage = await quotaUsage(user.id);
  const amount = (value: number | null) => value === null ? "등록 예정" : `${value.toLocaleString("ko-KR")}원`;
  const limit = (value: number | null) => value === null ? "무제한" : value.toLocaleString("ko-KR");
  return <section><h1>요금제</h1><p>현재 {current.name} 플랜 · 모든 요금은 원 단위입니다.</p><div className="panel" style={{padding:20,marginBottom:20,lineHeight:2}}>Projects {usage.projects} / {limit(current.projectLimit)} ? Tokens {limit(usage.tokens)} / {limit(current.tokenLimit)} ? Images {usage.images} / {limit(current.dailyImageLimit)}</div><p className="muted">연간 가격은 별도로 책정됩니다. 유료 플랜과 Business 계약은 관리자에게 문의해 주세요. 총 토큰은 자동 갱신되지 않습니다.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16}}>{plans.map(plan => <article key={plan.code} className="panel" style={{padding:24,borderColor:plan.recommended ? "var(--primary)" : undefined}}>{plan.recommended && <span className="badge purple">추천</span>}<h2 style={{marginTop:12}}>{plan.name}</h2><p>월간 <strong>{plan.priceMode === "contact" ? "협의" : amount(plan.monthlyPrice)}</strong></p><p>연간 {plan.priceMode === "contact" ? "협의" : amount(plan.yearlyPrice)}</p><ul style={{paddingLeft:18,lineHeight:2.2}}><li>프로젝트 {limit(plan.projectLimit)}개</li><li>총 토큰 {limit(plan.tokenLimit)}{plan.code === "business" && " · 사용량 과금"}</li><li>일일 이미지 {limit(plan.dailyImageLimit)}개</li><li>프롬프트 이미지 {plan.attachmentLimit}개</li><li>이력 {plan.historyEnabled ? "생성" : "미생성"}</li></ul>{current.code === plan.code && <span className="badge purple">이용 중</span>}</article>)}</div></section>;
}
