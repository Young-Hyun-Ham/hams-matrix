import { SubscriptionPlans } from "@/components/subscription-plans";
import { listPlans } from "@/lib/plans";
import {navigationMenus} from "@/lib/menus";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand, Icon } from "@/components/icon";
import { projectTabLabels } from "@/lib/project-tabs";
import "@/styles/workspace.css";

export default async function GuestPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params; const section = path.join("/");
  const tabs = Object.entries(projectTabLabels);
  const valid = ["dashboard","team","ai","subscription","settings","help","project",...tabs.map(([key]) => `project/${key}`)];
  if (!valid.includes(section)) notFound();
  const plans = section === "subscription" ? await listPlans() : [];
  const project = section.startsWith("project");
  const title = navigationMenus.find(m=>m.key===section)?.label ?? (section === "dashboard" ? "대시보드" : section === "team" ? "팀 공유" : section === "ai" ? "AI Chatbot" : projectTabLabels[path[1] as keyof typeof projectTabLabels] ?? "프로젝트 개요");
  return <div style={{display:"flex",minHeight:"100vh"}}>
    <aside style={{width:220,flexShrink:0,padding:24,background:"var(--surface)",borderRight:"1px solid var(--line)"}}><Brand /><p className="muted" style={{marginTop:24}}>게스트 · 조회 전용</p><nav aria-label="게스트 메뉴" style={{display:"grid",gap:10}}>{navigationMenus.filter(m=>!m.admin).map(({key,label,icon}) => <Link className="button" key={key} href={`/guest/${key}`} aria-current={section === key ? "page" : undefined}><Icon name={icon} size={16} />{label}</Link>)}<Link className="button" href="/guest/project">샘플 프로젝트</Link></nav><p style={{lineHeight:1.8,color:"var(--muted)",fontSize:12}}>메뉴를 이동하며 화면을 둘러보세요. 표시된 내용은 체험용 샘플입니다.</p><div style={{display:"grid",gap:10}}><Link className="button primary" href="/signup">회원등록</Link><Link className="button" href="/login">로그인</Link></div></aside>
    <main style={{flex:1,minWidth:0,padding:"32px clamp(16px,4vw,48px)"}}><span className="badge purple">게스트 체험</span>{section !== "subscription" && <h1 style={{marginTop:16}}>{title}</h1>}<p className="muted">로그인 없이 화면을 둘러볼 수 있습니다. 기능을 사용하려면 회원등록해 주세요.</p>
      {project && <nav aria-label="프로젝트 메뉴" style={{display:"flex",gap:6,flexWrap:"wrap",margin:"24px 0"}}>{tabs.map(([key,label]) => <Link className="button small" key={key} href={`/guest/project/${key}`}>{label}</Link>)}</nav>}
      {section === "subscription" ? <SubscriptionPlans plans={plans} readOnly /> : ['settings','help'].includes(section)?<section className="panel" style={{padding:28}}>{section==='settings'?<><nav aria-label="샘플 설정 탭">토큰 사용량 · 인터페이스 관리 · 계정 설정</nav><p>토스트 위치: 하단 · 기본 테마: 라이트</p><p>개인 설정과 실제 사용량 조회·저장은 로그인 후 이용할 수 있습니다.</p></>:<><h2>HAMS Matrix 서비스 안내</h2><p>프로젝트와 팀 공유, AI를 연결하는 워크스페이스입니다.</p><Link href="/policies">서비스 이용 안내</Link></>}</section>:section === "dashboard" ? <><div className="matrix-stats">{[["프로젝트","1"],["요구사항","12"],["진행률","65%"],["팀원","4"]].map(([label,value]) => <div className="panel" style={{padding:24}} key={label}><span className="muted">{label}</span><h2 style={{marginTop:12}}>{value}</h2></div>)}</div><section className="panel" style={{padding:28,marginTop:24}}><h2>서비스 구축 프로젝트</h2><p className="muted">기획부터 설계, 개발과 검증까지 산출물의 연결을 관리합니다.</p><span className="badge green">진행 중</span><p><Link className="button" href="/guest/project">프로젝트 보기</Link></p></section></> : section === "team" ? <section className="panel" style={{padding:28}}><h2>프로젝트 팀 공유</h2><p className="muted">서비스 구축 프로젝트 · viewer</p><article style={{borderTop:"1px solid var(--line)",paddingTop:20}}><span className="badge purple">공지</span><h3 style={{marginTop:12}}>프로젝트 킥오프 안내</h3><p>이번 주에는 요구사항을 정리하고 화면 설계를 함께 검토합니다.</p><small className="muted">프로젝트 관리자 · 샘플 게시글</small></article></section> : section === "ai" ? <section className="panel" style={{padding:28}}><h2>프로젝트와 연결되는 AI</h2><p>요구사항 정리, 설계 검토, 산출물 생성과 이미지 분석을 도와드립니다.</p><div style={{background:"var(--canvas)",borderRadius:12,padding:24}}><p>요구사항을 기준으로 검증할 항목을 정리해 주세요.</p><p className="muted">기능별 검증 기준과 연결된 설계 문서를 함께 확인하세요.</p></div><p className="muted">게스트 모드에서는 AI 요청과 이미지 첨부를 사용할 수 없습니다.</p></section> : <section className="panel" style={{padding:28}}><h2>서비스 구축 프로젝트 · {title}</h2><p className="muted">프로젝트 권한 viewer · 샘플 데이터</p><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}><thead><tr>{["관리번호","항목","내용","상태"].map(label => <th style={{padding:14,borderBottom:"1px solid var(--line)"}} key={label}>{label}</th>)}</tr></thead><tbody>{[["DOC-01","사업 범위 정의","프로젝트의 목표와 범위를 정리합니다.","완료"],["DOC-02","요구사항 분석","요구사항과 화면·설계의 관계를 연결합니다.","진행 중"],["DOC-03","검증 계획","요구사항별 검증 기준을 준비합니다.","초안"]].map(row => <tr key={row[0]}>{row.map((value,index) => <td key={index} style={{padding:14,borderBottom:"1px solid var(--line)"}}>{value}</td>)}</tr>)}</tbody></table></div></section>}
    </main>
  </div>;
}
