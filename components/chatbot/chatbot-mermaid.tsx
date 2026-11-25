"use client";
import { useEffect, useId, useRef, useState } from "react";
import { documentMermaidError, renderMermaid } from "@/lib/mermaid-render";
import { safeMermaidSvg } from "@/lib/mermaid-preview";
export function ChatbotMermaid({ code }: { code: string }) {
  const target = useRef<HTMLDivElement>(null),
    id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [error, setError] = useState("");
  useEffect(() => {
    const host = target.current;
    if (!host) return;
    let active = true;
    const invalid = documentMermaidError(code);
    if (!invalid)
      void renderMermaid(
        `chatbot${id}`,
        code,
        {
          startOnLoad: false,
          securityLevel: "strict",
          theme: "neutral",
          htmlLabels: false,
          flowchart: { htmlLabels: false, useMaxWidth: true },
          suppressErrorRendering: true,
        },
        host,
        () => active,
      )
        .then((result) => {
          if (active && result) {
            host.innerHTML = safeMermaidSvg(result.svg);
            setError("");
          }
        })
        .catch(() => {
          if (active) {
            host.replaceChildren();
            setError(
              "Mermaid 문법을 확인해 주세요. 원본 코드로 수정할 수 있습니다.",
            );
          }
        });
    return () => {
      active = false;
      host.replaceChildren();
    };
  }, [code, id]);
  const invalid = documentMermaidError(code);
  return (
    <div className="chatbot-document-preview">
      {(invalid || error) && <p role="alert">{invalid || error}</p>}
      <div ref={target} className="chatbot-mermaid-canvas" />
      <details>
        <summary>Mermaid 코드</summary>
        <pre>{code}</pre>
      </details>
    </div>
  );
}
