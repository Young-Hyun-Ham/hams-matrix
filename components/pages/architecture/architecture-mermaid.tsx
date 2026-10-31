"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Code2, Copy, Maximize2, Minus, Plus, RotateCcw, Save, Scan } from "lucide-react";
import type { Artifact } from "@/lib/artifact-types";
import { editableMermaidError } from "@/lib/architecture-mermaid";
import { useTheme } from "@/stores/theme";
import { useProjectPage } from "@/components/shared/project-page-context";
import { jsonRequest } from "@/lib/client-request";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { architectureTheme } from "./architecture-theme";
import { readableMermaidLabels, safeMermaidSvg } from "./mermaid-preview";

export function ArchitectureMermaid({ artifact, visible = true, onDirtyChange }: { artifact: Artifact; visible?: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const context = useProjectPage();
  const [draft, setDraft] = useState<{ code: string; saved: string; version: number } | null>(null);
  const dirty = !!draft && draft.code !== draft.saved;
  const code = dirty ? draft.code : artifact.structure?.mermaid?.code ?? "";
  const baseVersion = dirty ? draft.version : artifact.version;
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const theme = useTheme((state) => state.theme);
  const accentColor = useTheme((state) => state.accentColor);
  const paletteKey = `${theme}:${accentColor ?? "default"}`;
  const canvas = useRef<HTMLDivElement>(null), viewport = useRef<HTMLDivElement>(null), editor = useRef<HTMLTextAreaElement>(null), gutter = useRef<HTMLDivElement>(null);
  const sequence = useRef(0), submitting = useRef(false), mounted = useRef(true);
  const [result, setResult] = useState<{ code: string; theme: string; error: string; width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [saveError, setSaveError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const notify = context.onDirtyChange;
  const ready = result?.code === code && result.theme === paletteKey;
  const valid = ready && !result.error && !!code.trim();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    onDirtyChange?.(dirty); notify?.(dirty);
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", prevent);
    return () => { onDirtyChange?.(false); notify?.(false); window.removeEventListener("beforeunload", prevent); };
  }, [dirty, notify, onDirtyChange]);
  useEffect(() => {
    let active = true;
    const target = canvas.current, requestId = ++sequence.current;
    if (!target || !visible) return;
    target.replaceChildren();
    if (!code.trim()) return;
    const container = document.createElement("div"); target.append(container);
    const timer = setTimeout(async () => {
      try {
        const error = editableMermaidError(code); if (error) throw new Error(error);
        const { default: mermaid } = await import("mermaid"); if (!active) return;
        const palette = architectureTheme(theme, accentColor);
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "base", htmlLabels: false,
          themeVariables: { darkMode: theme === "dark", background: palette.background,
            primaryColor: palette.node, primaryTextColor: palette.text, primaryBorderColor: palette.border,
            secondaryColor: palette.group, tertiaryColor: palette.infrastructure, lineColor: palette.line,
            textColor: palette.text, nodeTextColor: palette.text, titleColor: palette.text,
            clusterBkg: palette.group, clusterBorder: palette.border, edgeLabelBackground: palette.background,
            fontSize: "16px", fontFamily: "Arial, 'Malgun Gothic', sans-serif" },
          maxTextSize: 150000, flowchart: { htmlLabels: false, useMaxWidth: false, padding: 20 }, suppressErrorRendering: true });
        await mermaid.parse(code); if (!active) return;
        const rendered = await mermaid.render(`architecture${id}${requestId}`, code, container); if (!active) return;
        container.innerHTML = safeMermaidSvg(rendered.svg);
        const svg = container.querySelector("svg")!;
        const bounds = svg.viewBox.baseVal;
        const width = bounds.width || 800, height = bounds.height || 600;
        svg.setAttribute("width", String(width)); svg.setAttribute("height", String(height)); svg.style.maxWidth = "none";
        readableMermaidLabels(svg, palette.text);
        setResult({ code, theme: paletteKey, error: "", width, height });
      } catch (reason) {
        if (active) { container.replaceChildren(); setResult({ code, theme: paletteKey, error: reason instanceof Error ? reason.message : "미리보기를 표시하지 못했습니다.", width: 0, height: 0 }); }
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); container.remove(); };
  }, [code, theme, accentColor, paletteKey, id, visible]);
  function change(value: string) {
    setDraft({ code: value, saved: dirty ? draft.saved : artifact.structure?.mermaid?.code ?? "", version: baseVersion }); setMessage(""); setSaveError("");
  }
  async function save() {
    if (!context.can('architecture','UPDATE') || !dirty || !valid || submitting.current) return;
    submitting.current = true; setBusy(true); setSaveError("");
    try {
      if (!await context.verifyPermission('architecture','UPDATE')) throw new Error('현재 프로젝트 권한으로 코드를 저장할 수 없습니다.');
      const result = await jsonRequest(`/api/projects/${artifact.projectId}/artifacts/${artifact.id}/mermaid`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, version: baseVersion }) });
      if (!mounted.current) return;
      context.updateData?.(result.data); setDraft(null); setMessage("코드를 저장했습니다.");
    } catch (reason) { if (mounted.current) setSaveError(reason instanceof Error ? reason.message : "코드를 저장하지 못했습니다."); }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  const scale = (value: number) => setZoom(Math.min(3, Math.max(.2, value)));
  return <div className="matrix-architecture-mermaid">
    <section className="architecture-code-panel" aria-label="Mermaid 코드 편집기">
      <div className="architecture-editor-toolbar"><h3><Code2 size={17} aria-hidden="true" /> Code</h3><div>
        <button className="button" type="button" disabled={busy} onClick={async () => { try { await navigator.clipboard.writeText(code); setMessage("복사했습니다."); } catch { setMessage("코드를 선택해 복사해 주세요."); } }}><Copy size={14} />복사</button>
        <button className="button" type="button" disabled={!dirty || busy} onClick={() => setConfirmReset(true)}><RotateCcw size={14} />되돌리기</button>
        {context.can('architecture','UPDATE') && <button className="button primary" type="button" disabled={!dirty || !valid || busy} onClick={save}><Save size={14} />{busy ? "저장 중…" : "코드 저장"}</button>}
      </div></div>
      <div className="architecture-code-editor"><div ref={gutter} className="architecture-code-lines" aria-hidden="true">{code.split("\n").map((_, index) => <div key={index}>{index + 1}</div>)}</div>
        <textarea ref={editor} value={code} onChange={(event) => change(event.target.value)} readOnly={!context.can('architecture','UPDATE') || busy}
          aria-label="Mermaid 코드" spellCheck={false} autoCapitalize="off" autoCorrect="off" wrap="off" maxLength={150000}
          placeholder={'graph TD\n  Browser["Web Browser"] --> API["API Server"]'}
          onScroll={(event) => { if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop; }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { viewport.current?.focus(); return; }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
            if (event.key === "Tab" && context.can('architecture','UPDATE') && !busy) {
              event.preventDefault(); const start = event.currentTarget.selectionStart, end = event.currentTarget.selectionEnd;
              change(`${code.slice(0, start)}  ${code.slice(end)}`); requestAnimationFrame(() => editor.current?.setSelectionRange(start + 2, start + 2));
            }
          }} />
      </div>
      <div className="architecture-editor-status" role="status">{dirty ? "미저장 변경 · " : ""}{code.split("\n").length}줄 · {message || (context.can('architecture','UPDATE') ? "Tab 들여쓰기 · Ctrl/Cmd+S 저장" : "읽기 전용")}</div>
      <p className="architecture-editor-note">코드 수정은 Mermaid 구성도에 반영됩니다. 구성요소·연결 목록은 변경되지 않으며, 구성 정보를 변경해 저장하면 코드가 다시 생성됩니다.</p>
      {dirty && artifact.version !== baseVersion && <p role="alert" className="matrix-error">서버 내용이 변경되었습니다. 코드를 복사하고 되돌리기로 최신 내용을 불러와 주세요.</p>}
      {saveError && <p role="alert" className="matrix-error">{saveError}</p>}
    </section>
    <section className="architecture-preview-panel" aria-label="Mermaid 실시간 미리보기">
      <div className="architecture-editor-toolbar"><h3>미리보기</h3><div>
        <button type="button" className="button" aria-label="축소" onClick={() => scale(zoom - .1)}><Minus size={15} /></button><span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="button" aria-label="확대" onClick={() => scale(zoom + .1)}><Plus size={15} /></button>
        <button type="button" className="button" aria-label="화면에 맞추기" disabled={!valid} onClick={() => { const box = viewport.current; if (box && result) scale(Math.min((box.clientWidth - 48) / result.width, (box.clientHeight - 48) / result.height, 1)); }}><Scan size={15} /></button>
        <button type="button" className="button" aria-label="100% 크기" onClick={() => scale(1)}>1:1</button>
        <button type="button" className="button" aria-label="미리보기 전체 화면" onClick={() => { void viewport.current?.requestFullscreen?.().catch(() => setMessage("전체 화면을 지원하지 않는 환경입니다.")); }}><Maximize2 size={15} /></button>
      </div></div>
      <div ref={viewport} className="matrix-architecture-mermaid-preview" onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest("button")) return;
        const box = event.currentTarget; drag.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop }; box.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => { const state = drag.current; if (state) { event.currentTarget.scrollLeft = state.left - event.clientX + state.x; event.currentTarget.scrollTop = state.top - event.clientY + state.y; } }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} tabIndex={0} aria-label="다이어그램, 드래그 또는 스크롤로 이동">
        {!code.trim() ? <p className="architecture-preview-message">왼쪽 편집기에 Mermaid 코드를 입력해 주세요.</p> : !ready ? <p className="architecture-preview-message" role="status">미리보기를 그리는 중…</p> : result.error ? <pre className="architecture-preview-error" role="alert">{result.error}</pre> : null}
        <div className="architecture-preview-space" style={{ width: valid ? result.width * zoom + 48 : undefined, height: valid ? result.height * zoom + 48 : undefined }}>
          <div ref={canvas} className="architecture-preview-canvas" style={{ transform: `scale(${zoom})` }} />
        </div>
      </div>
      <div className="architecture-editor-status">입력 후 자동 미리보기 · 드래그로 이동 · 원본 크기에서 글자를 확인하세요.</div>
    </section>
    {confirmReset && <ConfirmationDialog title="Mermaid 코드 되돌리기" confirmLabel="변경사항 버리기" onClose={() => setConfirmReset(false)} onConfirm={() => { setDraft(null); setConfirmReset(false); setSaveError(""); }}><p>미저장 코드를 버리고 현재 저장된 코드를 불러오시겠습니까?</p></ConfirmationDialog>}
  </div>;
}
