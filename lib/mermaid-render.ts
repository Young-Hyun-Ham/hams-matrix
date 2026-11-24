import type { MermaidConfig, RenderResult } from "mermaid";

// initialize/parse/render share global configuration. Serialize the entire
// operation, including architecture previews, rather than just render().
let pending: Promise<unknown> = Promise.resolve();

export function renderMermaid(
  id: string,
  code: string,
  config: MermaidConfig,
  container: HTMLElement,
  isActive: () => boolean,
): Promise<RenderResult | null> {
  const result = pending.then(async () => {
    if (!isActive()) return null;
    const { default: mermaid } = await import("mermaid");
    if (!isActive()) return null;
    mermaid.initialize(config);
    await mermaid.parse(code);
    if (!isActive()) return null;
    return mermaid.render(id, code, container);
  });
  pending = result.catch(() => undefined);
  return result;
}

export function documentMermaidError(code: string): string | null {
  if (!code.trim()) return "Mermaid 코드가 비어 있습니다.";
  if (code.length > 150000)
    return "Mermaid 코드는 150,000자까지 미리볼 수 있습니다.";
  const normalized = code
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (
    /%%\s*\{|^\s*---|@\s*\{|!\[|\b(?:click|href|callback|javascript|securityLevel|htmlLabels)\b|(?:https?|data|javascript):|url\s*\(|<\/?[a-z!]|@import|\\/im.test(
      normalized,
    )
  )
    return "설정 지시문, HTML, 외부 링크 및 클릭 동작은 사용할 수 없습니다.";
  const first = normalized
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.trim().startsWith("%%"));
  if (
    !/^\s*(?:(?:graph|flowchart)\s+(?:TD|TB|BT|LR|RL)\b|sequenceDiagram\b|classDiagram\b|stateDiagram(?:-v2)?\b|erDiagram\b|gantt\b)/.test(
      first ?? "",
    )
  )
    return "미리보기는 flowchart, sequence, class, state, ER, gantt 도식을 지원합니다.";
  return null;
}
