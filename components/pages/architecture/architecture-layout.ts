import type { ArchitectureNode, Artifact } from "@/lib/artifact-types";
import { architectureLayers, topologyFor } from "@/lib/architecture";

// Conservative character widths keep Korean and Latin labels inside exported SVGs.
export function wrapText(text: string, width: number): string[] {
  return text.split(/\r?\n/).flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "", length = 0;
    for (const char of paragraph) {
      const size = /[^\u0020-\u007e]/.test(char) ? 1 : 0.6;
      if (length + size > width && line) { lines.push(line); line = ""; length = 0; }
      line += char;
      length += size;
    }
    lines.push(line);
    return lines;
  });
}

export type PositionedNode = ArchitectureNode & {
  x: number; y: number; width: number; height: number;
  nameLines: string[]; techLines: string[]; color: string;
};

export function architectureLayout(artifact: Artifact) {
  const topology = topologyFor(artifact);
  const title = wrapText(artifact.title, 48);
  const overview = wrapText(artifact.fields.definition ?? "", 80);
  const headerHeight = 96 + title.length * 30 + overview.length * 19;
  const nodes: PositionedNode[] = [];
  const groups: { id: string; label: string; y: number; height: number }[] = [];
  let y = headerHeight + 34;
  for (const layer of architectureLayers) {
    const members = topology.nodes.filter((node) => node.layer === layer.id);
    if (!members.length) continue;
    const top = y;
    y += 48;
    for (let offset = 0; offset < members.length; offset += 3) {
      const row = members.slice(offset, offset + 3).map((node) => {
        const nameLines = wrapText(node.name, 18);
        const techLines = wrapText(node.technology, 22);
        return { ...node, nameLines, techLines, height: Math.max(112, 48 + nameLines.length * 22 + techLines.length * 19) };
      });
      const rowHeight = Math.max(...row.map((node) => node.height));
      const rowLeft = 76 + (1018 - (row.length * 300 + (row.length - 1) * 38)) / 2;
      row.forEach((node, column) => nodes.push({ ...node, x: rowLeft + column * 338, y, width: 300, height: rowHeight, color: layer.color }));
      y += rowHeight + 58;
    }
    groups.push({ id: layer.id, label: layer.label, y: top, height: y - top - 22 });
    y += 34;
  }
  const infrastructure = groups.filter((group) => !["client", "external"].includes(group.id));
  const infrastructureTop = infrastructure[0]?.y ?? 0;
  const infrastructureBottom = infrastructure.length ? infrastructure[infrastructure.length - 1].y + infrastructure[infrastructure.length - 1].height : 0;
  const edges = topology.edges.flatMap((edge, index) => {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    if (!source || !target) return [];
    const sx = source.x + source.width / 2, tx = target.x + target.width / 2;
    const down = target.y > source.y;
    const sy = down ? source.y + source.height : source.y;
    const ty = down ? target.y : target.y + target.height;
    const startY = sy + (down ? 20 : -20);
    const endY = ty + (down ? -20 : 20);
    // Long connections use an outer gutter, avoiding intermediate components.
    const gutter = 1090 + (index % 6) * 14;
    let path: string, labelX: number, labelY: number;
    if (source.y === target.y) {
      const bendY = source.y - 18 - (index % 3) * 9;
      path = `M ${sx} ${source.y} V ${bendY} H ${tx} V ${target.y}`;
      labelX = (sx + tx) / 2; labelY = bendY - 8;
    } else if (Math.abs(ty - sy) < 220) {
      const middle = (sy + ty) / 2;
      path = `M ${sx} ${sy} V ${middle} H ${tx} V ${ty}`;
      labelX = (sx + tx) / 2 + (sx === tx ? 72 : 0); labelY = middle - 8;
    } else {
      path = `M ${sx} ${sy} V ${startY} H ${gutter} V ${endY} H ${tx} V ${ty}`;
      labelX = (tx + gutter) / 2; labelY = endY - 8;
    }
    const labelLines = wrapText(edge.label, 24);
    const labelWidth = Math.max(32, ...labelLines.map((line) => [...line].reduce((width, char) => width + (/[^\u0020-\u007e]/.test(char) ? 12 : 7), 16)));
    return [{ ...edge, path, labelX, labelY, labelLines, labelWidth }];
  });
  return { nodes, edges, groups, title, overview, headerHeight, width: 1200,
    height: Math.max(400, y + 48), infrastructureTop, infrastructureBottom };
}
