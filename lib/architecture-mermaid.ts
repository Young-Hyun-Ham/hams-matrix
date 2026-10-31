import type { Artifact, ArchitectureTopology } from "./artifact-types";
import { architectureLayers } from "./architecture";

export const mermaidGeneratorVersion = "topology-flowchart-v1";
export const manualMermaidVersion = "manual-flowchart-v1";
// User-authored flowcharts support comments, subgraphs, classDef and style.
// Rendering configuration and executable/external content remain server-owned.
export function editableMermaidError(code: unknown): string | null {
  if (typeof code !== "string" || !code.trim() || code.length > 150000) return "Mermaid 코드를 1~150,000자로 입력해 주세요.";
  const normalized = code.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "");
  if (/%%\s*\{|^\s*---|@\s*\{|\\|\b(?:click|href|callback|javascript|securityLevel|htmlLabels)\b|(?:https?|data|javascript):|url\s*\(|<\/?[a-z!]|@import/i.test(normalized))
    return "설정 지시문, HTML, 외부 링크 및 클릭 동작은 사용할 수 없습니다.";
  const first = normalized.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("%%"))?.trim();
  if (!first || !/^(?:graph|flowchart)\s+(?:TD|TB|BT|LR|RL)\s*(?:;|$)/.test(first)) return "graph TD 또는 flowchart TD 등으로 시작하는 구성도를 입력해 주세요.";
  return null;
}
export function mermaidSource(artifact: Artifact) {
  const topology = artifact.structure?.topology ?? { nodes: [], edges: [] };
  return {
    title: artifact.title,
    definition: artifact.fields.definition ?? "",
    topology: {
      nodes: [...topology.nodes].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...topology.edges].sort((a, b) => a.id.localeCompare(b.id)),
    },
    generatorVersion: mermaidGeneratorVersion,
  };
}

// AI chooses layout order only; names, shapes and directed connections always
// come from the validated source. This prevents invented or omitted topology.
export function validateMermaidOrder(value: unknown, topology: ArchitectureTopology) {
  const raw = value as { nodeIds?: unknown; edgeIds?: unknown } | null;
  function permutation(value: unknown, expected: string[]) {
    if (!Array.isArray(value) || value.length !== expected.length ||
      new Set(value).size !== value.length ||
      value.some((id) => typeof id !== "string" || !expected.includes(id)))
      throw new Error("AI 구성도의 구성요소 또는 연결이 원본과 일치하지 않습니다.");
    return value as string[];
  }
  return {
    nodeIds: permutation(raw?.nodeIds, topology.nodes.map((node) => node.id)),
    edgeIds: permutation(raw?.edgeIds, topology.edges.map((edge) => edge.id)),
  };
}

function label(text: string) {
  return text.replace(/[\r\n\t]+/g, " ").replace(/[^\p{L}\p{N} .,_:/+\-]/gu,
    (character) => `#${character.codePointAt(0)};`);
}
export function serializeMermaid(topology: ArchitectureTopology, order: ReturnType<typeof validateMermaidOrder>) {
  const ids = new Map(order.nodeIds.map((id, index) => [id, `n${index}`]));
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const edges = new Map(topology.edges.map((edge) => [edge.id, edge]));
  const lines = ["flowchart TD"];
  for (const layer of architectureLayers) {
    const group = order.nodeIds.map((id) => nodes.get(id)!).filter((node) => node.layer === layer.id);
    if (!group.length) continue;
    lines.push(`  subgraph l${layer.id}["${label(layer.label)}"]`);
    for (const node of group) {
      const text = label([node.name, node.technology].filter(Boolean).join(" · "));
      lines.push(node.shape === "database"
        ? `    ${ids.get(node.id)}[("${text}")]`
        : `    ${ids.get(node.id)}["${text}"]`);
    }
    lines.push("  end");
  }
  for (const id of order.edgeIds) {
    const edge = edges.get(id)!;
    lines.push(`  ${ids.get(edge.source)} -->${edge.label ? `|"${label(edge.label)}"|` : ""} ${ids.get(edge.target)}`);
  }
  return lines.join("\n");
}

// Only the server serializer's small grammar is rendered. No directives, HTML,
// links, arbitrary styles, interactions or other Mermaid diagram types.
export function isSafeArchitectureMermaid(code: string) {
  if (code.length > 150000) return false;
  const lines = code.split("\n");
  if (lines.shift() !== "flowchart TD") return false;
  const text = '[\\p{L}\\p{N} .,_:/+\\-#;]*';
  const allowed = new RegExp(`^(?:  subgraph l(?:client|gateway|frontend|backend|data|external)\\["${text}"\\]|    n\\d+(?:\\["${text}"\\]|\\[\\("${text}"\\)\\])|  end|  n\\d+ -->(?:\\|"${text}"\\|)? n\\d+)$`, "u");
  return lines.every((line) => allowed.test(line));
}
