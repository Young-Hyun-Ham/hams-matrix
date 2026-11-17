"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "@/stores/theme";
import { personalPalette } from "@/lib/personal-palette";
import { documentMermaidError, renderMermaid } from "@/lib/mermaid-render";
import { readableMermaidLabels, safeMermaidSvg } from "@/lib/mermaid-preview";
import styles from "@/styles/pages/viewer/md/MarkdownViewer.module.css";

export default function MermaidBlock({ code, line }: { code: string; line: number }) {
  const id = `documentMermaid${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [mode, setMode] = useState<"text" | "preview">("text");
  const [result, setResult] = useState<{ key: string; error: string } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);
  const theme = useTheme((state) => state.theme);
  const accentColor = useTheme((state) => state.accentColor);
  const resultKey = `${theme}:${accentColor ?? ""}:${code}`;

  useEffect(() => {
    if (mode !== "preview" || !canvas.current) return;
    const host = canvas.current;
    const request = ++sequence.current;
    let active = true;
    // Private targets prevent cancelled renders from touching a later block.
    const target = document.createElement("div");
    host.replaceChildren(target);
    void (async () => {
      try {
        const error = documentMermaidError(code);
        if (error) throw new Error(error);
        const palette = personalPalette(theme, accentColor);
        const dark = theme === "dark";
        const text = dark ? "#e7e7f0" : "#202335";
        const rendered = await renderMermaid(`${id}r${request}`, code, {
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: "base",
          htmlLabels: false,
          maxTextSize: 150000,
          themeVariables: {
            darkMode: dark,
            background: dark ? "#22222e" : "#ffffff",
            primaryColor: palette.soft,
            primaryBorderColor: palette.primary,
            primaryTextColor: text,
            secondaryColor: palette.soft,
            tertiaryColor: dark ? "#181821" : "#f7f8fc",
            textColor: text,
            lineColor: dark ? "#aaa6c3" : "#526a85",
            actorTextColor: text,
            actorBkg: palette.soft,
            signalTextColor: text,
            noteTextColor: text,
            noteBkgColor: palette.soft,
            edgeLabelBackground: dark ? "#22222e" : "#ffffff",
            fontFamily: "Arial, 'Malgun Gothic', sans-serif",
          },
          flowchart: { htmlLabels: false, useMaxWidth: true },
        }, target, () => active && sequence.current === request);
        if (!active || !rendered) return;
        target.innerHTML = safeMermaidSvg(rendered.svg);
        const svg = target.querySelector("svg");
        if (!svg) throw new Error("도식을 표시하지 못했습니다.");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", `${line}행 Mermaid 도식`);
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        readableMermaidLabels(svg, text);
        setResult({ key: resultKey, error: "" });
      } catch (reason) {
        if (!active) return;
        target.replaceChildren();
        setResult({ key: resultKey, error: reason instanceof Error ? reason.message : "도식을 표시하지 못했습니다." });
      }
    })();
    return () => { active = false; target.remove(); };
  }, [mode, code, id, theme, accentColor, line, resultKey]);

  const error = result?.key === resultKey ? result.error : "";
  return (
    <section className={styles.mermaidBlock} data-mermaid-block data-line={line}>
      <div role="tablist" aria-label={`${line}행 Mermaid 표시 모드`} className={styles.mermaidTabs}>
        {(["text", "preview"] as const).map((tab, index) => (
          <button key={tab} type="button" role="tab" id={`${id}-${tab}`}
            aria-controls={`${id}-panel`} aria-selected={mode === tab} tabIndex={mode === tab ? 0 : -1}
            onClick={() => {
              if (mode === tab) return;
              setResult(null); setMode(tab);
            }}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
              if (next !== index) { setResult(null); setMode(next === 0 ? "text" : "preview"); }
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }}>
            {tab === "text" ? "텍스트" : "미리보기"}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${mode}`} tabIndex={0}>
        {mode === "text" ? <pre><code className="language-mermaid">{code}</code></pre> : <>
          {result?.key !== resultKey && <p role="status">도식을 불러오는 중입니다.</p>}
          {error && <p role="status" className={styles.mermaidError}>{error}</p>}
          <div ref={canvas} className={styles.mermaidCanvas} />
        </>}
      </div>
    </section>
  );
}
