import "@/styles/admin-settings.css";
import {Suspense} from 'react';
import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {requirePlatformAdmin,listPlans} from '@/lib/plans';
import {isGuardrailAdmin} from '@/lib/ai/guardrail-policy';
import {GuardrailAdmin} from '@/components/admin/guardrail-admin';
import {PlanAdmin} from '@/components/admin/plan-admin';
import {AdminList,LoggingSettings} from '@/components/admin/admin-lists';
import {SettingsTabs} from '@/components/settings-tabs';
const items=[['plans','요금제'],['members','회원 관리'],['guardrails','AI 가드레일 관리'],['history','이력 관리']] as const;
export default function Page(props:{searchParams:Promise<{tab?:string}>}){return <Suspense fallback={<p>관리자 설정을 불러오는 중입니다.</p>}><AdminSettings {...props}/></Suspense>;}
async function AdminSettings({searchParams}:{searchParams:Promise<{tab?:string}>}){const user=await requireUser();requirePlatformAdmin(user);const {tab='plans'}=await searchParams;if(!items.some(([key])=>key===tab))redirect('/admin/settings?tab=plans');return <section className="admin-settings-page"><h1 className="admin-visually-hidden">관리자 설정 · {items.find(([key])=>key===tab)?.[1]}</h1><SettingsTabs base="/admin/settings" tab={tab} items={items} variant="admin"/><div className="admin-settings-content">{tab==='plans'?<PlanAdmin initialPlans={await listPlans()}/>:tab==='members'?<AdminList key="members" kind="members"/>:tab==='guardrails'?<><p>대상 워크스페이스: {user.workspaceName}</p>{isGuardrailAdmin(user)?<GuardrailAdmin workspaceName={user.workspaceName}/>:<p role="alert">대상 워크스페이스 owner/admin 권한이 필요합니다.</p>}</>:<><LoggingSettings/><AdminList key="history" kind="history"/></>}</div></section>;}
