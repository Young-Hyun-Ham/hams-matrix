"use client";
import { useEffect, useState } from "react";
import type { GuardrailPolicy, GuardrailResult, GuardrailStage } from "@/lib/ai/guardrail-types";
import { useGuardrailAttachments } from "./use-guardrail-attachments";
import { GuardrailTestAttachments } from "./guardrail-test-attachments";
import "./guardrail-admin.css";

type Snapshot = {
  active: { version: number; policy: GuardrailPolicy };
  draft: GuardrailPolicy; revision: number;
  versions: { version: number; published_at: string; restored_from: number | null }[];
  events: { id: string; request_id: string; policy_version: number; stage: string; decision: string; duration_ms: number; created_at: string; findings: { rule: string; severity: string }[] }[];
};
const booleanSettings: { key: "aiEnabled" | "inputEnabled" | "contextEnabled" | "outputEnabled" | "injectionDetection" | "sensitiveData" | "blockExternalLinks" | "classifierEnabled"; label: string; description: string }[] = [
  { key: "aiEnabled", label: "AI Chatbot 사용 허용", description: "해제한 정책을 적용하면 진행 중 요청도 다음 검사 시 중단합니다." },
  { key: "inputEnabled", label: "사용자 입력 검사", description: "사용자가 보낸 요청과 첨부를 검사합니다." },
  { key: "contextEnabled", label: "참고 자료와 이전 대화 검사", description: "프로젝트 자료·도구 결과·이전 대화의 간접 공격을 확인합니다." },
  { key: "outputEnabled", label: "최종 출력 검사", description: "답변 공개와 변경 저장 전에 검사합니다." },
  { key: "injectionDetection", label: "지시 탈취·정보 유출 유도 탐지", description: "단순 의심 문구는 기록하고, 고위험 판정은 차단 모드에서 막습니다." },
  { key: "sensitiveData", label: "민감정보 패턴 탐지", description: "API 키·개인 키·주민등록번호 패턴을 검사합니다. 모든 개인정보를 식별하는 검사는 아닙니다." },
  { key: "blockExternalLinks", label: "허용 목록 외 외부 링크 제한", description: "출력과 도구 인자의 HTTP/HTTPS 링크에 적용합니다." },
  { key: "classifierEnabled", label: "AI 분류 검사 추가", description: "도구 권한 없는 별도 모델로 검사합니다. 검사마다 토큰과 지연이 추가됩니다." },
];
const decisions: Record<string, string> = { allow: "허용", monitor: "관찰", block: "차단" };
const stages: Record<string, string> = { input: "입력", context: "참고 자료", tool: "도구 요청", "tool-result": "도구 결과", output: "출력" };
export function GuardrailAdmin({ workspaceName }: { workspaceName: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [policy, setPolicy] = useState<GuardrailPolicy | null>(null);
  const [tab, setTab] = useState("policy"), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [testText, setTestText] = useState("회원 관리 화면을 설계해 주세요.");
  const [testStage, setTestStage] = useState<GuardrailStage>("input");
  const [testResult, setTestResult] = useState<{ requestId: string; result: GuardrailResult; attachments?: { images: number; files: { name: string; characters: number }[]; readOnly: boolean } } | null>(null);
  const attachments = useGuardrailAttachments(busy, () => setTestResult(null));
  const [models, setModels] = useState<string[]>([]);
  async function reload() {
    const response = await fetch("/api/admin/ai-guardrails", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setSnapshot(data); setPolicy(data.draft);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/ai-guardrails", { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!controller.signal.aborted) { setSnapshot(data); setPolicy(data.draft); } })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "설정을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!policy?.classifierEnabled) return;
    const controller = new AbortController();
    fetch("/api/ai/models", { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (!controller.signal.aborted) setModels(data.models);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "검사 모델을 불러오지 못했습니다."); });
    return () => controller.abort();
  }, [policy?.classifierEnabled]);
  const dirty = !!snapshot && JSON.stringify(policy) !== JSON.stringify(snapshot.draft);
  function update<K extends keyof GuardrailPolicy>(key: K, value: GuardrailPolicy[K]) {
    setPolicy(current => current ? { ...current, [key]: value } : current);
    setTestResult(null); setNotice("");
  }
  async function action(kind: "draft" | "publish" | "restore" | "test", version?: number) {
    if (!snapshot || !policy || busy || (kind === "test" && attachments.loading)) return;
    if ((kind === "publish" || kind === "restore") && !window.confirm(kind === "restore" ? `버전 ${version}의 설정을 새 버전으로 적용하시겠습니까?` : "저장한 초안을 워크스페이스의 AI 보안 정책으로 적용하시겠습니까?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/ai-guardrails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: kind, revision: snapshot.revision, activeVersion: snapshot.active.version, policy, version, ...(kind === "test" ? { text: testText, stage: testStage, images: attachments.images.map(({ dataUrl }) => ({ dataUrl })), files: attachments.files.map(({ name, base64 }) => ({ name, base64 })) } : {}) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (kind === "test") setTestResult(data);
      else { await reload(); setTestResult(null); setNotice(kind === "draft" ? "초안을 저장했습니다. 적용 전까지 현재 정책이 유지됩니다." : "새 정책 버전을 적용했습니다."); }
    } catch (e) { setError(e instanceof Error ? e.message : "요청을 처리하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <main className="guardrail-admin">
    <header className="guardrail-heading"><div><p className="guardrail-eyebrow">WORKSPACE SECURITY</p><h1>AI 가드레일 관리</h1><p>{workspaceName}의 입력·출력과 도구 실행 정책을 관리합니다.</p></div>
      <button className="button" disabled={busy} onClick={async () => { if (dirty && !window.confirm("저장하지 않은 초안을 버리고 새로고침하시겠습니까?")) return; try { await reload(); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "새로고침하지 못했습니다."); } }}>새로고침</button>
    </header>
    {error && <p role="alert" className="guardrail-alert">{error}</p>}
    {notice && <p role="status" className="guardrail-notice">{notice}</p>}
    {!policy || !snapshot ? <p role="status">{error ? "설정을 확인해 주세요." : "설정을 불러오고 있습니다."}</p> : <>
      <div className="guardrail-summary"><span>적용 정책 <strong>{snapshot.active.version ? `v${snapshot.active.version}` : "기본 정책"}</strong></span><span>운영 상태 <strong>{!snapshot.active.policy.aiEnabled ? "AI 사용 중단" : snapshot.active.policy.mode === "enforce" ? "차단 모드" : "감시 모드"}</strong></span><span>초안 <strong>{dirty ? "저장하지 않은 변경 있음" : `수정 ${snapshot.revision}`}</strong></span></div>
      <div className="guardrail-tabs" role="tablist" aria-label="가드레일 관리">
        {[["policy", "정책 설정"], ["test", "정책 테스트"], ["history", "적용·검사 이력"]].map(([key, label]) => <button key={key} id={`guardrail-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`guardrail-panel-${key}`} onClick={() => setTab(key)}>{label}</button>)}
      </div>
      <section id={`guardrail-panel-${tab}`} role="tabpanel" aria-labelledby={`guardrail-tab-${tab}`}>
        {tab === "policy" && <>
          <div className="guardrail-baseline"><strong>항상 적용되는 보호</strong><p>인증·워크스페이스/프로젝트 권한·도구 스키마·실제 서버 비밀정보 유출 방지는 설정으로 해제할 수 없습니다. 가드레일이 모든 공격을 탐지하는 것은 아닙니다.</p><p>현재 적용 대상은 AI Chatbot입니다. 별도 아키텍처·WBS 이미지 생성은 이 설정의 적용 대상이 아닙니다.</p></div>
          <fieldset disabled={busy} className="guardrail-grid">
            <legend>검증 정책</legend>
            <label>운영 모드<select value={policy.mode} onChange={e => update("mode", e.target.value as GuardrailPolicy["mode"])}><option value="enforce">차단 — 고위험 판정 차단</option><option value="monitor">감시 — 탐지만 기록</option></select></label>
            <label>이미지 첨부<select value={policy.imageMode} onChange={e => update("imageMode", e.target.value as GuardrailPolicy["imageMode"])}><option value="read-only">조회 전용 — 이미지가 있는 대화는 DB 변경 금지</option><option value="block">첨부 차단</option><option value="scan">AI 검사 후 허용 — 이미지 지원 모델 필요</option></select></label>
            {booleanSettings.map(item => <label key={item.key} className="guardrail-toggle"><input type="checkbox" checked={policy[item.key]} onChange={e => update(item.key, e.target.checked)} /><span><strong>{item.label}</strong><small>{item.description}</small></span></label>)}
            <label>사용자 지정 차단 문구 <small>한 줄에 하나씩, 정규식 없이 문구를 비교합니다.</small><textarea rows={4} value={policy.blockedTerms.join("\n")} onChange={e => update("blockedTerms", e.target.value.split("\n"))} onBlur={() => update("blockedTerms", policy.blockedTerms.map(v => v.trim()).filter(Boolean))} /></label>
            <label>허용 외부 도메인 <small>예: example.com. 하위 도메인은 별도로 지정합니다.</small><textarea rows={4} value={policy.allowedDomains.join("\n")} onChange={e => update("allowedDomains", e.target.value.split("\n"))} onBlur={() => update("allowedDomains", policy.allowedDomains.map(v => v.trim()).filter(Boolean))} /></label>
            <div><strong>허용 변경 작업</strong><div className="guardrail-actions">{(["CREATE", "UPDATE", "DELETE"] as const).map((kind, index) => <label key={kind}><input type="checkbox" checked={policy.allowedActions.includes(kind)} onChange={e => update("allowedActions", e.target.checked ? [...policy.allowedActions, kind] : policy.allowedActions.filter(v => v !== kind))} />{["등록", "수정", "삭제"][index]}</label>)}</div></div>
            <label>한 요청의 최대 변경 건수<input type="number" min={0} max={3} value={policy.maxChanges} onChange={e => update("maxChanges", Number(e.target.value))} /></label>
            {policy.classifierEnabled && <>
              <label>AI 검사 모델<select value={policy.classifierModel} onChange={e => update("classifierModel", e.target.value)}><option value="">모델 선택</option>{[...new Set([...models, ...(policy.classifierModel ? [policy.classifierModel] : [])])].map(model => <option key={model}>{model}</option>)}</select></label>
              <label>AI 탐지 점수 기준 <small>점수는 공격 확률을 의미하지 않습니다.</small><input type="number" min={0.5} max={1} step={0.05} value={policy.classifierThreshold} onChange={e => update("classifierThreshold", Number(e.target.value))} /></label>
            </>}
          </fieldset>
          <div className="guardrail-footer"><p>필수 검사에 실패하면 요청을 차단합니다. 초안 저장 후 테스트하고 적용하세요.</p><button className="button" disabled={busy} onClick={() => void action("draft")}>초안 저장</button><button className="button primary" disabled={busy || dirty || !snapshot.revision} onClick={() => void action("publish")}>저장한 초안 적용</button></div>
        </>}
        {tab === "test" && <div className="guardrail-test"><h2>현재 초안으로 검사</h2><p>테스트는 정책을 적용하거나 문서를 변경하지 않습니다. AI 분류 검사를 켜면 검사 토큰이 발생합니다.</p><label>검사 단계<select value={testStage} disabled={busy} onChange={e => { setTestStage(e.target.value as GuardrailStage); setTestResult(null); }}>{Object.entries(stages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>테스트 내용<textarea rows={8} maxLength={10000} value={testText} disabled={busy} placeholder="검사할 내용을 입력하거나 캡처 이미지를 붙여넣으세요. 파일만 첨부해도 검사할 수 있습니다." onPaste={attachments.handlePaste} onChange={e => { setTestText(e.target.value); setTestResult(null); }} /></label>
          <GuardrailTestAttachments attachments={attachments} disabled={busy} />
          <button className="button primary" disabled={busy || attachments.loading || (!testText.trim() && !attachments.images.length && !attachments.files.length)} onClick={() => void action("test")}>{busy ? "검사 중…" : "검사 실행"}</button>
          {testResult && <div className={`guardrail-verdict is-${testResult.result.decision}`} role="status"><h3>{decisions[testResult.result.decision]}</h3><p>요청 ID: {testResult.requestId}</p>{testResult.attachments && <><p>첨부 이미지 {testResult.attachments.images}장 · 문서 {testResult.attachments.files.length}개</p>{testResult.attachments.files.map(file => <p key={file.name}>{file.name}: 본문 {file.characters.toLocaleString()}자 검사</p>)}</>}{testResult.result.imageInspection && <p>{({ classified: "이미지를 AI 분류 검사에 전달했습니다.", blocked: "현재 정책에서 이미지 첨부를 차단합니다.", "not-inspected": "이미지 내용은 검사하지 않았습니다. 내용 검사가 필요하면 AI 분류 검사와 이미지 검사 후 허용을 설정해 주세요.", failed: "이미지 검사에 실패하여 차단했습니다." })[testResult.result.imageInspection]}</p>}{testResult.attachments?.readOnly && <p>이 정책에서는 이미지가 포함된 대화의 DB 변경을 허용하지 않습니다.</p>}{testResult.result.findings.length ? <ul>{testResult.result.findings.map(f => <li key={`${f.rule}:${f.severity}`}>{f.rule} · {f.severity}</li>)}</ul> : <p>설정된 검사에서 탐지된 위험이 없습니다.</p>}</div>}
        </div>}
        {tab === "history" && <div className="guardrail-history"><h2>정책 적용 이력</h2>{!snapshot.versions.length && <p>아직 적용한 정책이 없습니다. 기본 정책을 사용하고 있습니다.</p>}<ul>{snapshot.versions.map(v => <li key={v.version}><span><strong>v{v.version}</strong> · {new Date(v.published_at).toLocaleString("ko-KR")}{v.restored_from ? ` · v${v.restored_from}에서 복원` : ""}</span><button className="button" disabled={busy || dirty || v.version === snapshot.active.version} onClick={() => void action("restore", v.version)}>새 버전으로 복원</button></li>)}</ul><h2>최근 검사·설정 변경 100건</h2><p>원문 입력과 답변은 저장하지 않습니다. 최신 내역은 새로고침으로 확인합니다.</p><div className="guardrail-table"><table><thead><tr><th>시간</th><th>단계·버전</th><th>판정</th><th>탐지 규칙</th><th>요청 ID</th></tr></thead><tbody>{snapshot.events.map(event => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString("ko-KR")}</td><td>{stages[event.stage] ?? event.stage} · v{event.policy_version}</td><td>{decisions[event.decision] ?? event.decision}</td><td>{event.findings.map(f => f.rule).join(", ") || "—"}</td><td>{event.request_id}</td></tr>)}</tbody></table>{!snapshot.events.length && <p>검사 이력이 없습니다.</p>}</div></div>}
      </section>
    </>}
  </main>;
}
