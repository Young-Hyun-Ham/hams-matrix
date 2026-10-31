"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { preferenceKeys, usePreferences, type PreferenceEdits, type Preferences } from "@/stores/preferences";
import { isAccentColor } from "@/lib/personal-palette";
import { toast } from "@/stores/toast";
export function InterfaceSettings({ userId }: { userId: string }) {
  const initialized = usePreferences((state) => state.userId === userId);
  return initialized ? <InterfaceForm key={userId} userId={userId} /> : <p role="status">개인 설정을 불러오는 중입니다.</p>;
}
function InterfaceForm({ userId }: { userId: string }) {
  const { saved, preview, save, busy, reload, owner } = usePreferences();
  const [edits, setEdits] = useState<PreferenceEdits>({}), [tab, setTab] = useState(0), [error, setError] = useState("");
  const [hexInput, setHexInput] = useState<string | null>(null), [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true), id = useId();
  const draft: Preferences = { ...saved, ...edits };
  const invalidHex = hexInput !== null && !isAccentColor(hexInput);
  const dirty = preferenceKeys.some((key) => draft[key] !== saved[key]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => {
    const store = usePreferences.getState();
    if (store.owner === owner) store.restore(userId);
  }, [userId, owner]);
  function change<K extends keyof PreferenceEdits>(key: K, value: Preferences[K]) {
    const next = { ...edits, [key]: value };
    setEdits(next); preview({ ...saved, ...next }, userId); setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (invalidHex) return;
    setError("");
    const changed = Object.fromEntries(preferenceKeys.filter((key) => draft[key] !== saved[key]).map((key) => [key, draft[key]]));
    try {
      const result = await save({ ...changed, version: saved.version });
      if (!result || !mounted.current) return;
      setEdits({}); setHexInput(null); toast("개인 설정을 저장했습니다.");
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "저장하지 못했습니다."); }
  }
  return <form className="panel settings-form personal-interface-form" onSubmit={submit}>
    <p>내 계정에만 적용되는 설정입니다. 두 탭의 변경사항을 함께 저장합니다.</p>
    <div className="interface-subtabs" role="tablist" aria-label="인터페이스 관리 하위 탭">
      {["인터페이스", "토스트"].map((label, index) => <button key={label} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={tab === index} tabIndex={tab === index ? 0 : -1}
        onClick={() => setTab(index)} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index; setTab(next); document.getElementById(`${id}-tab-${next}`)?.focus(); }}>{label}</button>)}
    </div>
    <fieldset disabled={busy || refreshing}>
      <div id={`${id}-panel-0`} role="tabpanel" aria-labelledby={`${id}-tab-0`} hidden={tab !== 0}>
        <label>기본 테마<select value={draft.defaultTheme} onChange={(event) => change("defaultTheme", event.target.value as "light" | "dark")}><option value="light">라이트</option><option value="dark">다크</option></select></label>
        <div className="personal-accent-controls">
          <label>강조 색상<input type="color" value={draft.accentColor ?? "#6d51e8"} onChange={(event) => { setHexInput(null); change("accentColor", event.target.value); }} /></label>
          <label>색상 코드<input type="text" aria-label="강조 색상 HEX 코드" value={hexInput ?? draft.accentColor ?? "#6d51e8"} pattern="#[0-9a-fA-F]{6}" maxLength={7} onChange={(event) => { setHexInput(event.target.value); if (isAccentColor(event.target.value)) change("accentColor", event.target.value); }} /></label>
          <button type="button" className="button" onClick={() => { setHexInput(null); change("accentColor", null); }}>기본 색상으로 되돌리기</button>
        </div>
        <p>{draft.accentColor === null ? "기본 보라색을 사용합니다." : "선택한 색상을 라이트·다크 화면과 글자 대비에 맞게 조정해 적용합니다."}</p>
        <div className="personal-accent-sample"><span className="badge purple">선택된 항목</span><span className="personal-accent-link">강조 글자</span><span className="personal-accent-button">강조 버튼</span></div>
      </div>
      <div id={`${id}-panel-1`} role="tabpanel" aria-labelledby={`${id}-tab-1`} hidden={tab !== 1}>
        <label>토스트 위치<select value={draft.toastPosition} onChange={(event) => change("toastPosition", event.target.value as "top" | "bottom")}><option value="top">상단</option><option value="bottom">하단</option></select></label>
        <label className="toast-color-setting">토스트 바탕화면 색<input type="color" value={draft.toastBackgroundColor} onChange={(event) => change("toastBackgroundColor", event.target.value)} /><span>{draft.toastBackgroundColor}</span></label>
        <label className="toast-color-setting">토스트 폰트 색상<input type="color" aria-label="토스트 폰트 색상" value={draft.toastFontColor} onChange={(event) => change("toastFontColor", event.target.value)} /><span>{draft.toastFontColor}</span></label>
        <label className="toast-color-setting">토스트 닫기 버튼 색상<input type="color" aria-label="토스트 닫기 버튼 색상" value={draft.toastCloseButtonColor ?? draft.toastFontColor} onChange={(event) => change("toastCloseButtonColor", event.target.value)} /><span>{draft.toastCloseButtonColor ?? "본문과 동일"}</span></label>
        <label className="toast-color-setting">토스트 닫기 버튼 바탕색<input type="color" aria-label="토스트 닫기 버튼 바탕색" value={draft.toastCloseButtonBackgroundColor ?? "#efefef"} onChange={(event) => change("toastCloseButtonBackgroundColor", event.target.value)} /><span>{draft.toastCloseButtonBackgroundColor ?? "시스템 기본"}</span></label>
        <button type="button" className="button" onClick={() => {
          const next = { ...edits, toastCloseButtonColor: null, toastCloseButtonBackgroundColor: null };
          setEdits(next); preview({ ...saved, ...next }, userId); setError("");
        }}>닫기 버튼 기본색 복원</button>
        <button type="button" className="button" onClick={() => { preview(draft, userId); toast("토스트 미리보기"); }}>토스트 미리보기</button>
      </div>
      <div className="personal-settings-actions"><button type="submit" className="button primary" disabled={!dirty || invalidHex}>{busy ? "저장 중…" : "저장"}</button><button type="button" className="button" onClick={() => { setEdits({}); setHexInput(null); preview(saved, userId); setError(""); }}>취소</button></div>
    </fieldset>
    {error && <div role="alert" className="error-message">{error}<button type="button" className="button" disabled={busy || refreshing} onClick={async () => {
      setRefreshing(true); try { const latest = await reload(); if (latest && mounted.current) { preview({ ...latest, ...edits }, userId); setError(""); } } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "조회 실패"); } finally { if (mounted.current) setRefreshing(false); }
    }}>초안을 유지하고 최신 설정 불러오기</button></div>}
  </form>;
}
