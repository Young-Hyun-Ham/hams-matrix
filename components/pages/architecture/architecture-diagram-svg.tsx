"use client";
import { useId, type Ref } from "react";
import type { Artifact } from "@/lib/artifact-types";
import { architectureLayout } from "./architecture-layout";

function Lines({ lines, x, y, size = 14, weight = 400, color = "#24364b", anchor = "start" }: {
  lines: string[]; x: number; y: number; size?: number; weight?: number; color?: string; anchor?: "start" | "middle";
}) {
  return <text x={x} y={y} fontSize={size} fontWeight={weight} fill={color} textAnchor={anchor}>
    {lines.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : size + 5}>{line || " "}</tspan>)}
  </text>;
}

export function ArchitectureDiagramSvg({ artifact, svgRef }: { artifact: Artifact; svgRef?: Ref<SVGSVGElement> }) {
  const id = useId().replace(/:/g, "");
  const markerId = `architecture-arrow-${id}`;
  const titleId = `architecture-title-${id}`;
  const layout = architectureLayout(artifact);
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={layout.width} height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-labelledby={titleId}
      fontFamily="Arial, 'Malgun Gothic', sans-serif" className="matrix-architecture-svg">
      <title id={titleId}>{`${artifact.title} · 아키텍처 구성도`}</title>
      <desc>영역별 구성요소와 등록된 통신 연결을 표시합니다. 화살표 방향은 출발에서 도착입니다.</desc>
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#3c526b" />
        </marker>
      </defs>
      <rect width={layout.width} height={layout.height} fill="#f1f6fc" />
      <Lines lines={[`${artifact.code} · SYSTEM ARCHITECTURE · ${artifact.status} · v${artifact.version}`]} x={52} y={35} size={13} color="#526a85" />
      <Lines lines={layout.title} x={52} y={77} size={25} weight={700} color="#10283f" />
      <Lines lines={layout.overview} x={52} y={95 + layout.title.length * 30} size={14} />
      {layout.infrastructureBottom > 0 && <g>
        <rect x={42} y={layout.infrastructureTop - 28} width={1116} height={layout.infrastructureBottom - layout.infrastructureTop + 44} rx={12} fill="#e7eef7" stroke="#8196ac" strokeDasharray="7 5" />
        <text x={58} y={layout.infrastructureTop - 10} fontSize={12} fontWeight={700} fill="#48617a">INFRASTRUCTURE</text>
      </g>}
      {layout.groups.map((group) => <g key={group.id}>
        <rect x={76} y={group.y} width={1018} height={group.height} rx={10} fill="#ffffff" fillOpacity={0.45} stroke="#b2c1d1" strokeDasharray="4 4" />
        <text x={94} y={group.y + 24} fontSize={14} fontWeight={700} fill="#3c526b">{group.label}</text>
      </g>)}
      {layout.edges.map((edge) => <path key={edge.id} d={edge.path} fill="none" stroke="#3c526b" strokeWidth={1.6} markerEnd={`url(#${markerId})`} />)}
      {layout.nodes.map((node) => <g key={node.id}>
        <title>{`${node.name}${node.technology ? ` · ${node.technology}` : ""}`}</title>
        {node.shape === "database" ? <>
          <path d={`M ${node.x} ${node.y + 16} a 150 16 0 0 1 300 0 v ${node.height - 32} a 150 16 0 0 1 -300 0 Z`} fill={node.color} stroke="#637b95" strokeWidth={1.4} />
          <ellipse cx={node.x + 150} cy={node.y + 16} rx={150} ry={16} fill={node.color} stroke="#637b95" strokeWidth={1.4} />
        </> : <>
          <rect x={node.x + 3} y={node.y + 4} width={node.width} height={node.height} rx={9} fill="#b7c8dc" opacity={0.3} />
          <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={9} fill={node.color} stroke="#637b95" strokeWidth={1.4} />
          <rect x={node.x + 12} y={node.y + 13} width={24} height={17} rx={3} fill="#ffffff" stroke="#637b95" />
          <path d={`M ${node.x + 16} ${node.y + 19} h 16 M ${node.x + 16} ${node.y + 24} h 10`} stroke="#637b95" />
        </>}
        <Lines lines={node.nameLines} x={node.x + 150} y={node.y + 51} size={17} weight={700} anchor="middle" />
        <Lines lines={node.techLines} x={node.x + 150} y={node.y + 57 + node.nameLines.length * 22} size={14} anchor="middle" />
      </g>)}
      {layout.edges.filter((edge) => edge.label).map((edge) => <g key={edge.id}>
        <rect x={edge.labelX - edge.labelWidth / 2} y={edge.labelY - 14} width={edge.labelWidth} height={edge.labelLines.length * 17 + 4} rx={4} fill="#f1f6fc" />
        <Lines lines={edge.labelLines} x={edge.labelX} y={edge.labelY} size={12} anchor="middle" />
      </g>)}
      {!layout.nodes.length && <Lines lines={["구성요소를 등록하면 다이어그램이 표시됩니다."]} x={600} y={layout.headerHeight + 90} size={17} anchor="middle" />}
      <Lines lines={[`담당자: ${artifact.fields.owner || "미등록"} · 구성요소 ${layout.nodes.length}개 · 연결 ${layout.edges.length}개`]} x={52} y={layout.height - 24} size={12} color="#526a85" />
    </svg>
  );
}
