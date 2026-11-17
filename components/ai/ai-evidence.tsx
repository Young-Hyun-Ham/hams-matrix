import type { RagReference } from "@/lib/ai/rag-types";

export function AiEvidence({
  references,
  expanded = false,
}: {
  references?: RagReference[];
  expanded?: boolean;
}) {
  if (!references?.length) return null;
  return (
    <details className="matrix-ai-evidence" open={expanded}>
      <summary>프로젝트 근거 {references.length}건</summary>
      <ul>
        {references.map((reference) => (
          <li key={reference.chunkId}>
            {reference.href ? (
              <a href={reference.href}>{reference.title || "제목 없는 근거"}</a>
            ) : (
              reference.title || "제목 없는 근거"
            )}
            {reference.version && <> · 버전 {reference.version}</>}
            {reference.section && <> · {reference.section}</>}
          </li>
        ))}
      </ul>
    </details>
  );
}
