import ELK, { type ElkNode, type ElkPoint } from "elkjs/lib/elk.bundled.js";
import type { Artifact } from "./artifact-types";

export const ERD_LAYOUT_VERSION = "erd-orthogonal-v1";
export type ErdTable = {
  id: string;
  name: string;
  logicalName: string;
  columns: {
    id: string;
    name: string;
    type: string;
    pk: boolean;
    fk: boolean;
    nullable: boolean;
    unique: boolean;
  }[];
};
export type ErdRelation = {
  id: string;
  parent: string;
  parentColumn: string;
  child: string;
  childColumn: string;
  nullable: boolean;
  unique: boolean;
};
export type ErdSource = {
  projectName: string;
  tables: ErdTable[];
  relations: ErdRelation[];
};
export type ErdLayout = {
  version: string;
  width: number;
  height: number;
  nodes: { id: string; x: number; y: number; width: number; height: number }[];
  edges: { id: string; points: ElkPoint[] }[];
  crossings: number;
};
export function erdSource(
  projectName: string,
  artifacts: Artifact[],
): ErdSource {
  const tables = artifacts
    .filter((a) => a.kind === "database")
    .sort((a, b) => a.id.localeCompare(b.id));
  const relations: ErdRelation[] = [];
  for (const table of tables)
    for (const column of table.structure?.columns ?? []) {
      if (!column.reference) continue;
      const parent = tables.find((t) => t.id === column.reference!.tableId);
      if (
        !parent?.structure?.columns?.some(
          (c) => c.id === column.reference!.columnId,
        )
      )
        throw new Error(
          "유효하지 않은 FK가 있습니다. 테이블 관계를 확인해 주세요.",
        );
      relations.push({
        id: `${table.id}:${column.id}`,
        parent: parent.id,
        parentColumn: column.reference.columnId,
        child: table.id,
        childColumn: column.id,
        nullable: column.nullable,
        unique:
          column.unique ||
          (column.primaryKey &&
            table.structure?.columns?.filter((c) => c.primaryKey).length === 1),
      });
    }
  return {
    projectName,
    tables: tables.map((t) => ({
      id: t.id,
      name: t.fields.physicalName || t.title,
      logicalName: t.fields.logicalName || t.title,
      columns: (t.structure?.columns ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        type: `${c.dataType}${c.length ? `(${c.length})` : ""}`,
        pk: c.primaryKey,
        fk: !!c.reference,
        nullable: c.nullable,
        unique: c.unique,
      })),
    })),
    relations,
  };
}
function wrap(text: string, max = 38) {
  const lines: string[] = [];
  let current = "",
    units = 0;
  for (const char of text.replace(/[\u0000-\u001f]/g, " ")) {
    const size = /[\u0000-\u007f]/.test(char) ? 0.55 : 1;
    if (units + size > max && current) {
      lines.push(current);
      current = "";
      units = 0;
    }
    current += char;
    units += size;
  }
  lines.push(current);
  return lines;
}
function card(table: ErdTable) {
  const title = wrap(table.name, 30),
    logical = wrap(table.logicalName, 38);
  const header = 20 + title.length * 22 + logical.length * 18;
  let y = header;
  const rows = table.columns.map((c) => {
    const lines = wrap(
      `${c.pk ? "PK " : ""}${c.fk ? "FK " : ""}${c.unique && !c.pk ? "UQ " : ""}${c.name}  ${c.type}${c.nullable ? "" : "  NOT NULL"}`,
    );
    const height = Math.max(32, lines.length * 19 + 12),
      top = y;
    y += height;
    return {
      id: c.id,
      lines,
      top,
      height,
      center: top + height / 2,
      pk: c.pk,
      fk: c.fk,
    };
  });
  return { width: 650, height: y + 8, header, title, logical, rows };
}
function inside(
  a: ElkPoint,
  b: ElkPoint,
  n: { x: number; y: number; width: number; height: number },
) {
  const eps = 0.1;
  return Math.abs(a.x - b.x) < eps
    ? a.x > n.x + eps &&
        a.x < n.x + n.width - eps &&
        Math.max(a.y, b.y) > n.y + eps &&
        Math.min(a.y, b.y) < n.y + n.height - eps
    : a.y > n.y + eps &&
        a.y < n.y + n.height - eps &&
        Math.max(a.x, b.x) > n.x + eps &&
        Math.min(a.x, b.x) < n.x + n.width - eps;
}
export function validateErdLayout(layout: ErdLayout, source: ErdSource) {
  if (
    layout.nodes.length !== source.tables.length ||
    layout.edges.length !== source.relations.length ||
    new Set(layout.nodes.map((n) => n.id)).size !== source.tables.length ||
    new Set(layout.edges.map((e) => e.id)).size !== source.relations.length ||
    layout.nodes.some((n) => !source.tables.some((t) => t.id === n.id)) ||
    layout.edges.some((e) => !source.relations.some((r) => r.id === e.id))
  )
    throw new Error("ERD 배치 결과가 원본과 다릅니다.");
  for (const n of layout.nodes) {
    if (
      ![n.x, n.y, n.width, n.height].every(Number.isFinite) ||
      n.x < 0 ||
      n.y < 0 ||
      n.width <= 0 ||
      n.height <= 0
    )
      throw new Error("ERD 좌표가 올바르지 않습니다.");
    for (const other of layout.nodes)
      if (
        n.id !== other.id &&
        n.x < other.x + other.width &&
        n.x + n.width > other.x &&
        n.y < other.y + other.height &&
        n.y + n.height > other.y
      )
        throw new Error("테이블 배치가 겹칩니다.");
  }
  for (const edge of layout.edges) {
    const relation = source.relations.find((r) => r.id === edge.id)!;
    const parent = layout.nodes.find((n) => n.id === relation.parent)!;
    const child = layout.nodes.find((n) => n.id === relation.child)!;
    const parentCard = card(source.tables.find((t) => t.id === parent.id)!);
    const childCard = card(source.tables.find((t) => t.id === child.id)!);
    const start = edge.points[0],
      end = edge.points.at(-1);
    if (
      !start ||
      !end ||
      Math.abs(start.x - parent.x - parent.width) > 0.1 ||
      Math.abs(
        start.y -
          parent.y -
          parentCard.rows.find((r) => r.id === relation.parentColumn)!.center,
      ) > 0.1 ||
      Math.abs(end.x - child.x) > 0.1 ||
      Math.abs(
        end.y -
          child.y -
          childCard.rows.find((r) => r.id === relation.childColumn)!.center,
      ) > 0.1
    )
      throw new Error("관계선이 정확한 참조 컬럼에 연결되지 않았습니다.");
  }
  for (const edge of layout.edges)
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1],
        b = edge.points[i];
      if (
        ![a.x, a.y, b.x, b.y].every(Number.isFinite) ||
        (Math.abs(a.x - b.x) > 0.1 && Math.abs(a.y - b.y) > 0.1)
      )
        throw new Error("직각 관계선을 생성하지 못했습니다.");
      if (layout.nodes.some((n) => inside(a, b, n)))
        throw new Error(
          "관계선이 테이블 내부를 통과합니다. 다시 생성해 주세요.",
        );
    }
}
function crossings(edges: ErdLayout["edges"]) {
  let count = 0;
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      for (let a = 1; a < edges[i].points.length; a++)
        for (let b = 1; b < edges[j].points.length; b++) {
          const p = edges[i].points[a - 1],
            q = edges[i].points[a],
            r = edges[j].points[b - 1],
            s = edges[j].points[b];
          const horizontal = Math.abs(p.y - q.y) < 0.1;
          if (horizontal === Math.abs(r.y - s.y) < 0.1) continue;
          const h1 = horizontal ? p : r,
            h2 = horizontal ? q : s,
            v1 = horizontal ? r : p,
            v2 = horizontal ? s : q;
          if (
            v1.x > Math.min(h1.x, h2.x) &&
            v1.x < Math.max(h1.x, h2.x) &&
            h1.y > Math.min(v1.y, v2.y) &&
            h1.y < Math.max(v1.y, v2.y)
          )
            count++;
        }
    }
  return count;
}
export async function layoutErd(
  source: ErdSource,
  tableIds: string[],
): Promise<ErdLayout> {
  if (
    !source.tables.length ||
    source.tables.length > 100 ||
    source.tables.reduce((n, t) => n + t.columns.length, 0) > 2000 ||
    source.relations.length > 400
  )
    throw new Error(
      "미리보기는 테이블 1~100개, 컬럼 합계 2,000개, FK 400개까지 지원합니다.",
    );
  if (
    tableIds.length !== source.tables.length ||
    new Set(tableIds).size !== tableIds.length ||
    tableIds.some((id) => !source.tables.some((t) => t.id === id))
  )
    throw new Error("AI 배치 계획의 테이블 목록이 원본과 다릅니다.");
  const elk = new ELK();
  const cards = new Map(source.tables.map((t) => [t.id, card(t)]));
  const children: ElkNode[] = tableIds.map((id) => {
    const c = cards.get(id)!;
    return {
      id,
      width: c.width,
      height: c.height,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: source.relations.flatMap((r, index) => {
        const result = [];
        if (r.parent === id)
          result.push({
            id: `p${index}`,
            x: c.width,
            y: c.rows.find((row) => row.id === r.parentColumn)!.center,
            width: 0,
            height: 0,
            layoutOptions: { "elk.port.side": "EAST" },
          });
        if (r.child === id)
          result.push({
            id: `c${index}`,
            x: 0,
            y: c.rows.find((row) => row.id === r.childColumn)!.center,
            width: 0,
            height: 0,
            layoutOptions: { "elk.port.side": "WEST" },
          });
        return result;
      }),
    };
  });
  // Bundled ELK uses an in-process worker; no worker thread needs termination.
  let best: ErdLayout | undefined;
  for (const seed of [11, 37]) {
    const graph = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.randomSeed": String(seed),
        "elk.padding": "[top=50,left=50,bottom=50,right=50]",
        "elk.spacing.nodeNode": "100",
        "elk.spacing.componentComponent": "140",
        "elk.layered.spacing.nodeNodeBetweenLayers": "200",
        "elk.layered.spacing.edgeNodeBetweenLayers": "40",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "18",
        "elk.spacing.edgeNode": "30",
        "elk.spacing.edgeEdge": "18",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.mergeEdges": "false",
      },
      children: structuredClone(children),
      edges: source.relations.map((r, i) => ({
        id: r.id,
        sources: [`p${i}`],
        targets: [`c${i}`],
      })),
    });
    const layout: ErdLayout = {
      version: ERD_LAYOUT_VERSION,
      width: Math.ceil(graph.width ?? 0),
      height: Math.ceil(graph.height ?? 0),
      nodes: (graph.children ?? []).map((n) => ({
        id: n.id,
        x: n.x!,
        y: n.y!,
        width: n.width!,
        height: n.height!,
      })),
      edges: (graph.edges ?? []).map((e) => ({
        id: e.id,
        points: (e.sections ?? []).flatMap((s) => [
          s.startPoint,
          ...(s.bendPoints ?? []),
          s.endPoint,
        ]),
      })),
      crossings: 0,
    };
    if (layout.edges.some((e) => e.points.length < 2))
      throw new Error("관계선 일부를 생성하지 못했습니다.");
    validateErdLayout(layout, source);
    layout.crossings = crossings(layout.edges);
    if (
      !best ||
      layout.crossings < best.crossings ||
      (layout.crossings === best.crossings &&
        layout.width * layout.height < best.width * best.height)
    )
      best = layout;
  }
  return best!;
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function renderErdSvg(source: ErdSource, layout: ErdLayout) {
  const width = Math.max(900, layout.width);
  const title = wrap(
    `${source.projectName} · ERD`,
    Math.max(20, Math.floor((width - 84) / 24)),
  );
  const statsY = 100 + (title.length - 1) * 28;
  const header = statsY + 25,
    footer = 48;
  const height = layout.height + header + footer;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f6f8fc"/><style>text{font-family:'Malgun Gothic','Noto Sans CJK KR',Arial,sans-serif;fill:#17243d}</style>`,
    `<text x="42" y="38" font-size="13" fill="#5766cf">DATABASE RELATIONSHIP MAP</text>${title.map((line, index) => `<text x="42" y="${70 + index * 28}" font-size="24" font-weight="700">${escape(line)}</text>`).join("")}<text x="42" y="${statsY}" font-size="14">${source.tables.length} tables · ${source.relations.length} foreign keys · PK = primary key · FK = foreign key · UQ = unique</text>`,
    `<g transform="translate(0,${header})">`,
  ];
  layout.edges.forEach((e, index) => {
    const color = ["#5366c7", "#208775", "#aa6d22", "#9957ad", "#367f9b"][
      index % 5
    ];
    const d = e.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
    parts.push(
      `<path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`,
    );
    // End-point dots connect to the exact registered column; one/many markers
    // stay in the edge channel instead of obscuring the column text.
    const start = e.points[0],
      end = e.points.at(-1)!;
    const relation = source.relations.find((r) => r.id === e.id)!;
    parts.push(
      `<circle cx="${start.x}" cy="${start.y}" r="3.5" fill="${color}"/><circle cx="${end.x}" cy="${end.y}" r="3.5" fill="${color}"/>`,
    );
    const previous = e.points.at(-2)!;
    const sx = Math.sign(previous.x - end.x),
      sy = Math.sign(previous.y - end.y);
    if (!relation.unique) {
      for (const offset of [-6, 0, 6])
        parts.push(
          `<path d="M${end.x},${end.y} L${end.x + sx * 13 - sy * offset},${end.y + sy * 13 + sx * offset}" stroke="${color}" stroke-width="1.7" fill="none"/>`,
        );
    }
  });
  for (const n of layout.nodes) {
    const table = source.tables.find((t) => t.id === n.id)!,
      c = card(table);
    parts.push(
      `<g transform="translate(${n.x},${n.y})"><rect width="${c.width}" height="${c.height}" rx="9" fill="#fff" stroke="#cbd3e5"/><path d="M9,0 H${c.width - 9} Q${c.width},0 ${c.width},9 V${c.header} H0 V9 Q0,0 9,0" fill="#e9edff"/>`,
    );
    c.title.forEach((line, i) =>
      parts.push(
        `<text x="16" y="${26 + i * 22}" font-size="18" font-weight="700">${escape(line)}</text>`,
      ),
    );
    c.logical.forEach((line, i) =>
      parts.push(
        `<text x="16" y="${26 + c.title.length * 22 + i * 18}" font-size="14">${escape(line)}</text>`,
      ),
    );
    for (const row of c.rows) {
      if (row.pk || row.fk)
        parts.push(
          `<rect x="1" y="${row.top}" width="${c.width - 2}" height="${row.height}" fill="${row.pk ? "#fff8e8" : "#f2f4ff"}"/>`,
        );
      parts.push(`<path d="M0,${row.top} H${c.width}" stroke="#e8ecf4"/>`);
      row.lines.forEach((line, i) =>
        parts.push(
          `<text x="16" y="${row.top + 23 + i * 19}" font-size="15">${escape(line)}</text>`,
        ),
      );
    }
    parts.push("</g>");
  }
  parts.push(
    `</g><text x="42" y="${height - 18}" font-size="13">Reference (PK/UQ) — FK · Crow's foot = many · Lines connect to exact columns · HAMS MATRIX</text></svg>`,
  );
  return { svg: parts.join(""), width, height };
}
