import type { ArchitectureTopology, Artifact } from "./artifact-types";

export const architectureLayers = [
  { id: "client", label: "클라이언트", color: "#e0edfb" },
  { id: "gateway", label: "API Gateway / 네트워크", color: "#dcf2ec" },
  { id: "frontend", label: "프런트엔드", color: "#e1edff" },
  { id: "backend", label: "백엔드 / 애플리케이션", color: "#ede5fb" },
  { id: "data", label: "데이터 / 캐시 / 메시지 큐", color: "#fef0d9" },
  { id: "external", label: "외부 서비스", color: "#e7edf3" },
] as const;

// Existing free-text documents remain usable without inventing network connections.
export function topologyFor(artifact: Artifact): ArchitectureTopology {
  if (artifact.structure?.topology) return artifact.structure.topology;
  const candidates = [
    {
      id: "legacy-framework",
      name: "프레임워크",
      technology: artifact.fields.frameworks,
      layer: "backend",
      shape: "service",
    },
    {
      id: "legacy-server",
      name: "서버 / 인프라",
      technology: artifact.fields.servers,
      layer: "gateway",
      shape: "service",
    },
    {
      id: "legacy-database",
      name: "데이터베이스",
      technology: artifact.fields.database,
      layer: "data",
      shape: "database",
    },
  ] as const;
  return {
    nodes: candidates
      .filter((node) => node.technology?.trim())
      .map((node) => ({ ...node })),
    edges: [],
  };
}

export function validateTopology(value: unknown): ArchitectureTopology {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (
    value: unknown,
    label: string,
    max: number,
    required = false,
  ) => {
    if (
      typeof value !== "string" ||
      value.length > max ||
      (required && !value.trim())
    )
      fail(`${label} 항목을 확인해 주세요. (최대 ${max}자)`);
    return (value as string).trim();
  };
  const raw = record(value);
  if (
    !Array.isArray(raw.nodes) ||
    raw.nodes.length > 30 ||
    !Array.isArray(raw.edges) ||
    raw.edges.length > 60
  )
    fail("아키텍처 구성요소는 최대 30개, 연결은 최대 60개입니다.");
  const nodeIds = new Set<string>();
  const nodes = (raw.nodes as unknown[]).map((value) => {
    const node = record(value);
    const id = text(node.id, "구성요소 ID", 100, true);
    if (nodeIds.has(id)) fail("구성요소 ID는 중복될 수 없습니다.");
    nodeIds.add(id);
    const layer = architectureLayers.find(
      (layer) => layer.id === node.layer,
    )?.id;
    if (!layer || (node.shape !== "service" && node.shape !== "database"))
      fail("구성요소의 영역과 모양을 확인해 주세요.");
    return {
      id,
      name: text(node.name, "구성요소 이름", 100, true),
      technology: text(node.technology ?? "", "기술 / 버전", 3000),
      layer: layer!,
      shape: node.shape as "service" | "database",
    };
  });
  const edgeIds = new Set<string>();
  const edges = (raw.edges as unknown[]).map((value) => {
    const edge = record(value);
    const id = text(edge.id, "연결 ID", 100, true);
    const source = text(edge.source, "출발 구성요소", 100, true);
    const target = text(edge.target, "도착 구성요소", 100, true);
    if (
      edgeIds.has(id) ||
      !nodeIds.has(source) ||
      !nodeIds.has(target) ||
      source === target
    )
      fail(
        "연결 ID는 중복 없이, 출발과 도착은 서로 다른 유효한 구성요소를 선택해 주세요.",
      );
    edgeIds.add(id);
    return {
      id,
      source,
      target,
      label: text(edge.label ?? "", "연결 설명", 80),
    };
  });
  return { nodes, edges };
}
